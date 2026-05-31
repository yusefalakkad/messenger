import axios from 'axios';
import { useAuthStore } from '@/stores/auth.store';
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

// Эти пути не требуют авто-обновления токена
const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

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
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: !isNative() });
        const newToken = data.data.accessToken;
        useAuthStore.getState().setAccessToken(newToken);
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
