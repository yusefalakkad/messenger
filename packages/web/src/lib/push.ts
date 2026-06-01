/**
 * Web Push на клиенте — регистрация SW, подписка, отправка subscription на бэк.
 */
import { api } from './api';

const SW_PATH = '/sw.js';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  const out     = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager'   in window
    && 'Notification'  in window;
}

export async function setupPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };

  // SW регистрируется молча в фоне — не блокирует UI
  const reg = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });

  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };

  // Если есть подписка — обновим её на бэке (на случай если устройство забыли) и выйдем
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    try { await api.post('/push/subscribe', { subscription: sub.toJSON() }); } catch { /* */ }
    return { ok: true };
  }

  // Запрашиваем разрешение
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'denied' };
  }

  // Получаем VAPID public key
  const { data } = await api.get('/push/public-key');
  const publicKey = data?.data?.publicKey as string | undefined;
  if (!publicKey) return { ok: false, reason: 'no-key' };

  sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  await api.post('/push/subscribe', { subscription: sub.toJSON() });
  return { ok: true };
}

export async function teardownPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    try { await api.post('/push/unsubscribe', { endpoint: sub.endpoint }); } catch { /* */ }
    await sub.unsubscribe();
  }
}
