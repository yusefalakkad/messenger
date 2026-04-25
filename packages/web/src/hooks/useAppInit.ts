import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { initSocket, disconnectSocket } from '@/lib/socket';

/**
 * Хук инициализации приложения.
 * При загрузке страницы:
 * - Если пользователь "залогинен" но токен отсутствует → обновляем через refresh cookie
 * - Если токен есть → подключаем WebSocket
 * - Если обновление не удалось → разлогиниваем
 */
export function useAppInit(): boolean {
  const [ready, setReady] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken    = useAuthStore((s) => s.accessToken);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const logout         = useAuthStore((s) => s.logout);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (isAuthenticated) {
        if (!accessToken) {
          // Токен не сохранился (short-lived) — обновляем через httpOnly cookie
          try {
            const { data } = await api.post('/auth/refresh');
            if (!cancelled) {
              setAccessToken(data.data.accessToken);
              initSocket();
            }
          } catch {
            if (!cancelled) {
              disconnectSocket();
              logout();
            }
          }
        } else {
          // Токен есть — просто подключаем сокет
          initSocket();
        }
      }
      if (!cancelled) setReady(true);
    }

    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready;
}
