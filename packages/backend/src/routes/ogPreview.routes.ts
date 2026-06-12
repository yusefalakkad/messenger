import dns from 'dns/promises';
import net from 'net';
import { Router, Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { redis } from '../lib/redis';
import { sendSuccess, AppError } from '../utils/response';

const router = Router();

const CACHE_TTL_SEC = 24 * 60 * 60; // 24ч
const FETCH_TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES = 512 * 1024; // 512КБ
const MAX_REDIRECTS = 3;

interface OgPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

// ─── SSRF-guard ───────────────────────────────────────────────────────────────

/** Приватные/loopback/link-local адреса — запрещены (SSRF). */
function isPrivateIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) — проверяем IPv4-часть
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) ip = mapped[1];

  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 127 || a === 10) return true;          // 0.*, 127.*, 10.*
    if (a === 172 && b >= 16 && b <= 31) return true;            // 172.16-31.*
    if (a === 192 && b === 168) return true;                     // 192.168.*
    if (a === 169 && b === 254) return true;                     // 169.254.* (link-local)
    return false;
  }

  const low = ip.toLowerCase();
  if (low === '::1' || low === '::') return true;                // loopback / unspecified
  if (low.startsWith('fc') || low.startsWith('fd')) return true; // fc00::/7 (ULA)
  if (/^fe[89ab]/.test(low)) return true;                        // fe80::/10 (link-local)
  return false;
}

/**
 * Валидирует URL для исходящего запроса: только http/https, хост не должен
 * резолвиться в приватные/loopback/link-local адреса.
 */
async function assertSafeUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new AppError(400, 'BAD_URL', 'Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new AppError(400, 'BAD_URL', 'Only http/https URLs allowed');
  }

  // hostname для IPv6 приходит в скобках: [::1]
  const host = u.hostname.startsWith('[') && u.hostname.endsWith(']')
    ? u.hostname.slice(1, -1)
    : u.hostname;

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new AppError(404, 'NOT_FOUND', 'No preview available');
  } else {
    const addrs = await dns.lookup(host, { all: true }).catch(() => []);
    if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
      throw new AppError(404, 'NOT_FOUND', 'No preview available');
    }
  }
  return u;
}

// ─── Fetch (с ручными редиректами — каждый hop проходит SSRF-guard) ──────────

async function fetchHtml(startUrl: string): Promise<{ html: string; finalUrl: string } | null> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = await assertSafeUrl(current);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(u.toString(), {
        redirect: 'manual',
        signal: ac.signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; MessengerPreview/1.0)',
          accept: 'text/html',
        },
      });

      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location');
        if (!loc) return null;
        current = new URL(loc, u).toString();
        continue;
      }
      if (!resp.ok) return null;

      const ct = (resp.headers.get('content-type') ?? '').toLowerCase();
      if (!ct.includes('text/html')) return null;

      // Читаем максимум 512КБ — OG-теги всегда в <head>
      const reader = resp.body?.getReader();
      if (!reader) return null;
      const chunks: Buffer[] = [];
      let total = 0;
      while (total < MAX_BODY_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(Buffer.from(value));
          total += value.byteLength;
        }
      }
      await reader.cancel().catch(() => { /* стрим уже закрыт */ });
      return { html: Buffer.concat(chunks).toString('utf8'), finalUrl: u.toString() };
    } catch (err) {
      if (err instanceof AppError) throw err;
      return null; // network error / timeout
    } finally {
      clearTimeout(timer);
    }
  }
  return null; // слишком много редиректов
}

// ─── Парсинг OG-тегов (регэкспами, без зависимостей) ──────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // amp последним — иначе двойное декодирование
}

function ogTag(html: string, prop: string): string | undefined {
  // Атрибуты в любом порядке: property→content и content→property
  const re1 = new RegExp(`<meta\\s[^>]*(?:property|name)=["']${prop}["'][^>]*?content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta\\s[^>]*content=["']([^"']*)["'][^>]*?(?:property|name)=["']${prop}["']`, 'i');
  const m = html.match(re1) ?? html.match(re2);
  if (!m) return undefined;
  const value = decodeEntities(m[1]).trim();
  return value || undefined;
}

// ─── Route ────────────────────────────────────────────────────────────────────

// GET /og-preview?url= — превью ссылки (OpenGraph). Кэш в Redis 24ч.
// Rate-limit: достаточно глобального middleware в index.ts.
router.get('/',
  requireAuth,
  validate([query('url').isString().isLength({ min: 1, max: 2048 })]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawUrl = req.query.url as string;
      const cacheKey = `og:${rawUrl}`;

      const cached = await redis.get(cacheKey);
      if (cached) {
        sendSuccess(res, JSON.parse(cached) as OgPreview);
        return;
      }

      const fetched = await fetchHtml(rawUrl);
      if (!fetched) throw new AppError(404, 'NOT_FOUND', 'No preview available');

      const { html, finalUrl } = fetched;
      const title = ogTag(html, 'og:title')
        ?? (decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim() || undefined);
      const description = ogTag(html, 'og:description');
      let image = ogTag(html, 'og:image');
      const siteName = ogTag(html, 'og:site_name');

      // og:image может быть относительным — резолвим от финального URL
      if (image) {
        try { image = new URL(image, finalUrl).toString(); } catch { image = undefined; }
      }

      if (!title && !description && !image) {
        throw new AppError(404, 'NOT_FOUND', 'No preview available');
      }

      const result: OgPreview = { url: rawUrl, title, description, image, siteName };
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SEC);

      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

export default router;
