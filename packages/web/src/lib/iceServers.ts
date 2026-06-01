/**
 * ICE-серверы (STUN + TURN) для WebRTC.
 *
 * Получаем динамически с бэка через /api/webrtc/ice-servers — пароль TURN
 * не зашит в JS-бандл (build-time VITE_TURN_* deprecated).
 *
 * Кэшируем результат в памяти на 10 минут — для быстрого старта повторных
 * звонков. При истечении TTL запрашиваем снова.
 */
import { api } from './api';

const FALLBACK: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: { servers: RTCIceServer[]; at: number } | null = null;
let inflight: Promise<RTCIceServer[]> | null = null;

/**
 * Возвращает массив RTCIceServer. Если cache свеж — синхронно отдаёт его.
 * При ошибке API возвращает Google STUN-fallback.
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  // Свежий кэш
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.servers;
  }
  // Уже идёт запрос — ждём его
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data } = await api.get<{ data: { iceServers: RTCIceServer[] } }>('/webrtc/ice-servers');
      const servers = data.data?.iceServers ?? FALLBACK;
      cache = { servers, at: Date.now() };
      return servers;
    } catch {
      // Сетевая ошибка / 401 — fallback на публичный STUN.
      // Не кэшируем, чтобы при следующем звонке попробовать снова.
      return FALLBACK;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Инвалидирует кэш (например, при logout). */
export function clearIceServersCache(): void {
  cache = null;
}
