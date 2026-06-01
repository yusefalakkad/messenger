import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { clearKeyCache } from '@/lib/e2e';
import { clearCache as clearVaultCache, getCached as getVaultCached } from '@/lib/keyVault';

// Безопасное хранилище — работает и в инкогнито
const safeStorage = {
  getItem: (key: string) => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem: (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch { /* инкогнито */ }
  },
  removeItem: (key: string) => {
    try { localStorage.removeItem(key); } catch { /* инкогнито */ }
  },
};

interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatar?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  privateKey: string | null; // E2E private key — stored locally only
  isAuthenticated: boolean;

  setAuth: (user: AuthUser, accessToken: string, privateKey?: string) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      privateKey: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, privateKey) =>
        set({ user, accessToken, privateKey: privateKey ?? null, isAuthenticated: true }),

      setAccessToken: (accessToken) => set({ accessToken }),

      logout: () => {
        clearKeyCache();
        clearVaultCache();
        // Инвалидируем ICE-кэш (TURN credentials могли быть user-bound)
        import('@/lib/iceServers').then(({ clearIceServersCache }) => clearIceServersCache());
        set({ user: null, accessToken: null, privateKey: null, isAuthenticated: false });
      },
    }),
    {
      name: 'messenger-auth',
      storage: createJSONStorage(() => safeStorage),
      // accessToken не сохраняем (короткоживущий),
      // privateKey НЕ персистим в plaintext — он живёт в sessionStorage (keyVault).
      partialize: (s) => ({
        user: s.user,
        isAuthenticated: s.isAuthenticated,
      }),
      // При гидрации подхватываем плейнтекст-ключ из sessionStorage, если есть
      onRehydrateStorage: () => (state) => {
        if (state?.user?.id) {
          const cached = getVaultCached(state.user.id);
          if (cached) state.privateKey = cached;
        }
      },
    },
  ),
);
