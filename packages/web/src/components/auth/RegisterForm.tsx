import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { initSocket } from '@/lib/socket';
import { generateKeyPair } from '@/lib/crypto';
import { encryptAndStore } from '@/lib/keyVault';
import { v4 as uuidv4 } from 'uuid';

export default function RegisterForm() {
  const [form, setForm] = useState({ username: '', displayName: '', password: '', phone: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Generate E2E key pair — private key stays on device only
      const { publicKey, privateKey } = await generateKeyPair();

      const deviceId = uuidv4();
      try { localStorage.setItem('deviceId', deviceId); } catch { /* инкогнито */ }

      const { data } = await api.post('/auth/register', {
        username: form.username,
        displayName: form.displayName,
        password: form.password,
        phone: form.phone || undefined,
        publicKey, // send only public key to server
      });

      const { user, tokens } = data.data;
      // Шифруем приватный ключ паролем перед сохранением в localStorage.
      // Плейнтекст кэшируется в sessionStorage до закрытия вкладки.
      await encryptAndStore(user.id, privateKey, form.password);
      setAuth(user, tokens.accessToken, privateKey);
      initSocket();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Ошибка регистрации';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-white/60 mb-1.5">Username</label>
          <input
            className="input-base w-full"
            placeholder="@username"
            value={form.username}
            onChange={set('username')}
            pattern="[a-zA-Z0-9_]{3,32}"
            title="3-32 символа: буквы, цифры, _"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1.5">Имя</label>
          <input
            className="input-base w-full"
            placeholder="Иван"
            value={form.displayName}
            onChange={set('displayName')}
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-white/60 mb-1.5">Телефон (необязательно)</label>
        <input
          className="input-base w-full"
          type="tel"
          placeholder="+7 900 000 00 00"
          value={form.phone}
          onChange={set('phone')}
        />
      </div>

      <div>
        <label className="block text-sm text-white/60 mb-1.5">Пароль</label>
        <div className="relative">
          <input
            className="input-base w-full pr-12"
            type={showPass ? 'text' : 'password'}
            placeholder="Минимум 8 символов"
            value={form.password}
            onChange={set('password')}
            minLength={8}
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

      {/* E2E notice */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-start gap-2.5 bg-primary-600/10 border border-primary-500/25 rounded-xl px-4 py-3"
      >
        <ShieldCheck size={16} className="text-primary-300 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-primary-200/85 leading-relaxed">
          При регистрации автоматически создаётся ключ шифрования. Приватный ключ хранится только на вашем устройстве.
        </p>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-rose-300 text-sm"
        >
          {error}
        </motion.div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
        {loading ? <Loader2 size={18} className="animate-spin" /> : null}
        Создать аккаунт
      </button>
    </form>
  );
}
