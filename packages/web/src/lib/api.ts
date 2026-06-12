import axios from 'axios';
import { useAuthStore } from '@/stores/auth.store';
import { getSocket } from '@/lib/socket';
import { API_URL } from './config';
import { isNative } from './platform';

export const api = axios.create({
  baseURL: API_URL,
  // На native cookies cross-origin не отправляются, гоняем только JWT bearer.
  withCredentials: !isNative(),
});

// Attach access token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401 (только для защищённых эндпоинтов)
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

// Единый in-flight refresh на всё приложение. И interceptor (волна 401), и
// useAppInit (восстановление токена на буте) идут через него — иначе они шлют
// ДВА /auth/refresh с одним cookie-токеном, ловят гонку ротации сессии и один
// из них валит логаут. Здесь — single-flight: повторные вызовы ждут тот же промис.
let inFlightRefresh: Promise<string> | null = null;
export function refreshAccessToken(): Promise<string> {
  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = axios
    .post(`${API_URL}/auth/refresh`, {}, { withCredentials: !isNative() })
    .then(({ data }) => {
      const newToken = data.data.accessToken as string;
      useAuthStore.getState().setAccessToken(newToken);
      // socket.io читает auth только на handshake — подменяем токен у живого сокета.
      const s = getSocket();
      if (s) { s.auth = { token: newToken }; if (!s.connected) s.connect(); }
      return newToken;
    })
    .finally(() => { inFlightRefresh = null; });
  return inFlightRefresh;
}

// Эти пути возвращают 401 как ЛОГИЧЕСКУЮ ошибку (wrong code / invalid token),
// а не "истёкший access token". Они НЕ должны триггерить auto-refresh +
// logout-каскад — иначе юзер на каждый неверный код вылетает обратно на /auth
// с подменой "Wrong code" → "Session expired".
const AUTH_PATHS = [
  '/auth/login', '/auth/register', '/auth/refresh',
  '/auth/phone/request', '/auth/phone/verify', '/auth/phone/complete-profile',
  '/auth/login/2fa',
];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = AUTH_PATHS.some((p) => original?.url?.includes(p));

    // Не трогаем 401 от auth эндпоинтов (неверный пароль — это не expired token)
    if (error.response?.status === 401 && !original?._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        // Общий single-flight refresh (см. refreshAccessToken) — не плодит
        // параллельные /auth/refresh с одним cookie-токеном.
        const newToken = await refreshAccessToken();
        refreshQueue.forEach((cb) => cb(newToken));
        refreshQueue = [];
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        useAuthStore.getState().logout();
        // Мягкий редирект без перезагрузки страницы
        window.dispatchEvent(new CustomEvent('auth:logout'));
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);
