import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { initSocket } from '@/lib/socket';
import { v4 as uuidv4 } from 'uuid';

export default function LoginForm() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);

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
        deviceId = uuidv4(); // инкогнито без localStorage
      }

      const { data } = await api.post('/auth/login', {
        login, password, deviceId,
        deviceName: navigator.userAgent.slice(0, 64),
      });

      const { user, tokens } = data.data;
      setAuth(user, tokens.accessToken);
      initSocket();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Ошибка входа';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-white/60 mb-1.5">Логин, телефон или email</label>
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
        <label className="block text-sm text-white/60 mb-1.5">Пароль</label>
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
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 p-1"
          >
            {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
        {loading ? <Loader2 size={18} className="animate-spin" /> : null}
        Войти
      </button>
    </form>
  );
}
