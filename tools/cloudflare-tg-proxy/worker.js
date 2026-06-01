/**
 * Cloudflare Worker — HTTP-прокси для api.telegram.org.
 *
 * Зачем: некоторые VPS-хостинги режут outbound в Telegram (RU/KZ/etc).
 * Cloudflare-сеть к TG имеет беспрепятственный доступ. Бэк ходит сюда,
 * мы форвардим в TG, ответ возвращаем как есть.
 *
 * Безопасность: запросы аутентифицируются по заголовку X-Auth-Token,
 * который сравнивается со значением секрета PROXY_AUTH_TOKEN (задаётся
 * через wrangler secret put PROXY_AUTH_TOKEN). Без правильного токена
 * прокси отдаёт 401.
 *
 * Деплой:
 *   1. npm i -g wrangler && wrangler login
 *   2. cd tools/cloudflare-tg-proxy
 *   3. wrangler secret put PROXY_AUTH_TOKEN   # вводишь долгий случайный токен
 *   4. wrangler deploy
 *   5. Скопируй URL вида https://dakka-tg.<account>.workers.dev
 */

const TG_API = 'https://api.telegram.org';

export default {
  /**
   * @param {Request} request
   * @param {{ PROXY_AUTH_TOKEN: string }} env
   */
  async fetch(request, env) {
    // 0. CORS на всякий случай (вдруг кто-то решит дёрнуть из браузера)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':  '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
        },
      });
    }

    // 1. Аутентификация
    if (!env.PROXY_AUTH_TOKEN) {
      return json({ ok: false, error: 'proxy misconfigured: PROXY_AUTH_TOKEN not set' }, 500);
    }
    const auth = request.headers.get('X-Auth-Token') ?? '';
    if (!timingSafeEqual(auth, env.PROXY_AUTH_TOKEN)) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    // 2. Path должен быть вида /bot<TOKEN>/<method>
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/bot')) {
      return json({ ok: false, error: 'expected /bot<token>/<method>' }, 400);
    }

    // 3. Форвардим в Telegram
    const tgUrl = TG_API + url.pathname + url.search;
    let tgResp;
    try {
      tgResp = await fetch(tgUrl, {
        method:  request.method,
        headers: { 'Content-Type': request.headers.get('Content-Type') ?? 'application/json' },
        body:    (request.method !== 'GET' && request.method !== 'HEAD')
                   ? await request.arrayBuffer()
                   : undefined,
      });
    } catch (err) {
      return json({ ok: false, error: `upstream fetch failed: ${err.message}` }, 502);
    }

    // 4. Возвращаем ответ как есть
    return new Response(tgResp.body, {
      status:     tgResp.status,
      statusText: tgResp.statusText,
      headers:    { 'Content-Type': tgResp.headers.get('Content-Type') ?? 'application/json' },
    });
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Константно-временное сравнение, чтобы не сливать длину/первые символы. */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
