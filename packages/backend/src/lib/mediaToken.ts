/**
 * HMAC-подпись для медиа-URL.
 *
 * Зачем: `<img src="/api/media/...">` не пропускает Authorization header и в native
 * сборке (Capacitor) не отправляет cookies cross-origin. Без подписи такие запросы
 * получают 401. Подпись валидируется без обращения к БД (быстро) и привязана к
 * objectName + exp.
 *
 * Безопасность: anyone-with-URL access (как Telegram/WhatsApp). URL живёт 24 часа,
 * передаётся только через защищённый канал (https + socket auth). Этого достаточно
 * для медиа в личной переписке.
 *
 * Ключ: MEDIA_SIGNING_SECRET env, либо derived = HMAC(JWT_ACCESS_SECRET, "media-signing-v1").
 * Derivation позволяет rotate медиа-подписи независимо от JWT, не настраивая отдельный
 * секрет, и при этом не использует JWT-секрет в открытую.
 */
import crypto from 'node:crypto';
import { config } from '../config';

const HMAC_BYTES = 16; // 128 бит → base64url ≈ 22 символа. Достаточно от перебора.

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const explicit = process.env.MEDIA_SIGNING_SECRET;
  cachedKey = explicit
    ? Buffer.from(explicit, 'utf8')
    : crypto.createHmac('sha256', config.jwt.accessSecret).update('media-signing-v1').digest();
  return cachedKey;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hmacShort(payload: string): string {
  const mac = crypto.createHmac('sha256', getKey()).update(payload).digest();
  return b64url(mac.subarray(0, HMAC_BYTES));
}

/**
 * Подписывает objectName на TTL секунд. Возвращает токен вида `<expB36>.<hmacB64u>`.
 */
export function signMediaToken(
  objectName: string,
  ttlSeconds: number = config.media.signedUrlTtlSeconds,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const expB36 = exp.toString(36);
  const sig = hmacShort(`${objectName}\n${expB36}`);
  return `${expB36}.${sig}`;
}

/**
 * Проверяет токен против objectName. Возвращает true если:
 *  • формат корректный;
 *  • не истёк;
 *  • HMAC сходится (constant-time compare).
 */
export function verifyMediaToken(token: string, objectName: string): boolean {
  if (typeof token !== 'string' || token.length < 4) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expB36 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const exp = parseInt(expB36, 36);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expectedSig = hmacShort(`${objectName}\n${expB36}`);
  if (providedSig.length !== expectedSig.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}
