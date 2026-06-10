/**
 * Хелпер для подстановки HMAC-подписи в media URL.
 *
 * Принцип: на выходе из API/сокета строки вида `/api/media/...` превращаются в
 * абсолютный URL `<PUBLIC_BASE_URL>/api/media/...?t=<hmac>`. Клиент рендерит
 * полученный URL в `<img>/<video>` как есть — больше не нужно ни заголовков,
 * ни cookie, ни хост-префиксов.
 *
 * Walker обходит payload рекурсивно и подписывает строки в полях `url`,
 * `thumbnailUrl`, `avatarUrl`, `avatar`, `previewUrl`. Строки, которые не похожи
 * на media URL (например, эмодзи в `User.avatar`), пропускаются без изменений.
 */
import { signMediaToken } from './mediaToken';
import { config } from '../config';

// Матчит относительные `/api/media/...` и абсолютные `https://host/api/media/...`.
// Останавливается на `?` или `#` — query/fragment уже могут быть в строке.
const MEDIA_URL_RE = /^(?:https?:\/\/[^/]+)?(\/api\/media\/[^\s?#]+)/;

/** Подписать URL. Не-media URL возвращается как есть. */
export function signMediaUrl(url: string): string;
export function signMediaUrl(url: string | null | undefined): string | null | undefined;
export function signMediaUrl(url: string | null | undefined): string | null | undefined {
  if (!url || typeof url !== 'string') return url;
  const m = url.match(MEDIA_URL_RE);
  if (!m) return url;
  const pathPart = m[1];
  const objectName = pathPart.slice('/api/media/'.length);
  if (!objectName) return url;
  const token = signMediaToken(objectName);
  return `${config.media.publicBaseUrl}${pathPart}?t=${token}`;
}

const SIGN_KEYS = new Set([
  'url', 'thumbnailUrl', 'avatarUrl', 'avatar', 'previewUrl',
  'callerAvatar', // call:incoming payload
]);
// Поля-даты, чтобы walker их не дёргал. Prisma возвращает Date instances, но проверка
// instanceof Date выше всё равно отсекает. Это для случая, когда даты пришли как ISO-строки.
const SKIP_KEYS = new Set([
  'createdAt', 'updatedAt', 'deletedAt', 'readAt', 'leftAt', 'pinnedAt',
  'archivedAt', 'mutedUntil', 'expiresAt', 'lastSeenAt', 'lastTimestamp',
  'timestamp', 'iat', 'exp',
]);

/**
 * Рекурсивно обходит payload (массив или объект) и подписывает media URL'ы
 * в полях из SIGN_KEYS. Мутирует payload на месте.
 */
export function signMediaUrlsDeep<T>(payload: T): T {
  walk(payload, new WeakSet());
  return payload;
}

function walk(node: unknown, seen: WeakSet<object>): void {
  if (node == null) return;
  if (typeof node !== 'object') return;
  if (node instanceof Date) return;
  if (Buffer.isBuffer(node)) return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    for (const item of node) walk(item, seen);
    return;
  }

  const obj = node as Record<string, unknown>;
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    if (SKIP_KEYS.has(key)) continue;
    const v = obj[key];
    if (typeof v === 'string') {
      if (SIGN_KEYS.has(key)) {
        const signed = signMediaUrl(v);
        if (signed !== v) obj[key] = signed;
      }
    } else if (v && typeof v === 'object') {
      walk(v, seen);
    }
  }
}
