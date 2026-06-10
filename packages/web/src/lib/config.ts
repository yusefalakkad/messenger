/**
 * Единая точка конфигурации URL'ов.
 *
 * Web-сборка для prod (нginx отдаёт фронт) — относительные пути.
 * Native (iOS) сборка — абсолютные пути на боевой сервер.
 *
 * Управляется через переменные окружения Vite:
 *   VITE_API_URL      — базовый URL для axios (по умолчанию '/api')
 *   VITE_SOCKET_URL   — URL для socket.io     (по умолчанию '/')
 *
 * Для native-сборки положи .env.production:
 *   VITE_API_URL=https://akkdmsg.online/api
 *   VITE_SOCKET_URL=https://akkdmsg.online
 */
import { isNative } from './platform';

const PROD_HOST = 'https://akkdmsg.online';

const envApi    = (import.meta as any).env?.VITE_API_URL    as string | undefined;
const envSocket = (import.meta as any).env?.VITE_SOCKET_URL as string | undefined;

export const API_URL: string =
  envApi ?? (isNative() ? `${PROD_HOST}/api` : '/api');

export const SOCKET_URL: string =
  envSocket ?? (isNative() ? PROD_HOST : '/');

/**
 * @deprecated Backend теперь возвращает абсолютные HMAC-подписанные media URL'ы
 * вида `<host>/api/media/...?t=<hmac>`. Никаких клиентских манипуляций с хостом
 * не требуется — URL вставляется в `<img src>`/`<video src>` как есть.
 * Оставлено пустой строкой для обратной совместимости со старыми импортами.
 */
export const MEDIA_HOST: string = '';
