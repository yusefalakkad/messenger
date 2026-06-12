import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { initSocket } from '@/lib/socket';
import { decryptAndCache, hasEncryptedKey, encryptAndStore } from '@/lib/keyVault';
import { v4 as uuidv4 } from 'uuid';

export default function LoginForm() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 2FA-шаг: когда не null, показываем форму ввода кода
  const [twoFactor, setTwoFactor] = useState<{ token: string } | null>(null);
  const [code, setCode] = useState('');

  const setAuth = useAuthStore((s) => s.setAuth);

  const finishLogin = async (
    user: { id: string; username: string; displayName: string; avatar?: string | null },
    accessToken: string,
  ) => {
    // Расшифровать локальный E2E-ключ паролем, если он сохранён на этом устройстве
    let privateKey: string | undefined;
    if (hasEncryptedKey(user.id)) {
      const pk = await decryptAndCache(user.id, password);
      if (pk) privateKey = pk;
    } else {
      // Миграция: старая версия хранила plaintext в zustand persist
      try {
        const persisted = JSON.parse(localStorage.getItem('messenger-auth') ?? '{}');
        const legacy = persisted?.state?.privateKey;
        if (legacy) {
          await encryptAndStore(user.id, legacy, password);
          privateKey = legacy;
          delete persisted.state.privateKey;
          localStorage.setItem('messenger-auth', JSON.stringify(persisted));
        }
      } catch { /* */ }
    }
    setAuth(user, accessToken, privateKey);
    initSocket();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let deviceId: string;
      try {
        deviceId = localStorage.getItem('deviceId') ?? uuidv4();
        localStorage.setItem('deviceId', deviceId);
      } catch {
        deviceId = uuidv4();
      }

      const { data } = await api.post('/auth/login', {
        login, password, deviceId,
        deviceName: navigator.userAgent.slice(0, 64),
      });

      if (data.data.twoFactorRequired) {
        setTwoFactor({ token: data.data.twoFactorToken });
        return;
      }

      await finishLogin(data.data.user, data.data.tokens.accessToken);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Ошибка входа';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactor) return;
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login/2fa', {
        twoFactorToken: twoFactor.token,
        code,
      });
      await finishLogin(data.data.user, data.data.tokens.accessToken);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Неверный код';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ─── 2FA-шаг ────────────────────────────────────────────────────────────────

  if (twoFactor) {
    return (
      <form onSubmit={handleVerify} className="space-y-4">
        <div className="flex items-center gap-2 text-primary-600 dark:text-primary-300 text-sm">
          <ShieldCheck size={16} />
          <span>Двухфакторная аутентификация</span>
        </div>
        <div>
          <label className="block text-sm text-content/60 mb-1.5">
            Код из приложения (или recovery-код)
          </label>
          <input
            autoFocus
            inputMode="text"
            autoComplete="one-time-code"
            className="input-base w-full text-center tracking-widest font-mono text-lg"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
          {loading ? <Loader2 size={18} className="animate-spin" /> : null}
          Подтвердить
        </button>
        <button
          type="button"
          onClick={() => { setTwoFactor(null); setCode(''); setError(''); }}
          className="w-full text-sm text-content/40 hover:text-content/70"
        >
          ← Назад
        </button>
      </form>
    );
  }

  // ─── Обычный логин ─────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-content/60 mb-1.5">Логин, телефон или email</label>
        <input
          className="input-base w-full"
          placeholder="@username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          required
        />
      </div>

      <div>
        <label className="block text-sm text-content/60 mb-1.5">Пароль</label>
        <div className="relative">
          <input
            className="input-base w-full pr-12"
            type={showPass ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPass(!showPass)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-content/40 hover:text-content/70 p-1"
          >
            {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-rose-600 dark:text-rose-300 text-sm"
        >
          {error}
        </motion.div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
        {loading ? <Loader2 size={18} className="animate-spin" /> : null}
        Войти
      </button>
    </form>
  );
}
