import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Phone, KeyRound, User as UserIcon, Loader2, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { generateKeyPair } from '@/lib/crypto';
import { cachePlaintext, getCached as getCachedPrivKey } from '@/lib/keyVault';
import { initSocket } from '@/lib/socket';

type Step = 'phone' | 'link-bot' | 'code' | 'profile';

interface RequestCodeResp {
  cooldownSec: number;
  devOtp?: string;
  /** Если задан — нужно открыть Telegram-бота для handshake'а */
  telegramDeepLink?: string;
}

interface TokensPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface UserPayload {
  id: string;
  phone: string | null;
  username: string | null;
  displayName: string | null;
  avatar: string | null;
  publicKey: string | null;
}

interface VerifyResp {
  isNewUser: boolean;
  verifyToken?: string;
  tokens?: TokensPayload & { user: UserPayload };
}

interface CompleteResp {
  user: UserPayload;
  tokens: TokensPayload;
}

/**
 * Единый поток входа: телефон → OTP → (если новый) профиль.
 * Старого выбора Login/Register больше нет.
 */
export default function PhoneAuthForm() {
  const setAuth = useAuthStore((s) => s.setAuth);

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [verifyToken, setVerifyToken] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [tgDeepLink, setTgDeepLink] = useState<string | null>(null);

  // Cooldown-таймер для повторной отправки кода
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const codeInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus();
  }, [step]);

  // ── Шаг 1: запрос кода ─────────────────────────────────────────────────────
  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<{ success: boolean; data: RequestCodeResp }>(
        '/auth/phone/request',
        { phone },
      );
      setResendIn(data.data.cooldownSec);
      setDevOtpHint(data.data.devOtp ?? null);
      if (data.data.telegramDeepLink) {
        setTgDeepLink(data.data.telegramDeepLink);
        setStep('link-bot');
      } else {
        setStep('code');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Не удалось отправить код');
    } finally {
      setLoading(false);
    }
  }

  // ── Шаг 2: проверка кода ──────────────────────────────────────────────────
  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Verify без publicKey — бэк ничего не меняет в user.publicKey.
      const r = await api.post<{ success: boolean; data: VerifyResp }>(
        '/auth/phone/verify',
        { phone, code },
      );
      const v = r.data.data;

      if (v.isNewUser) {
        setVerifyToken(v.verifyToken!);
        setStep('profile');
        return;
      }

      const t = v.tokens!;
      // Есть ли у нас сохранённый приватный ключ для этого юзера?
      const cached = getCachedPrivKey(t.user.id);

      if (cached) {
        // Reload вкладки — ключ ещё в sessionStorage. Используем как есть.
        setAuth(t.user as any, t.accessToken, cached);
        initSocket();
      } else {
        // Новое устройство / очистка storage → регенерим, шлём новый publicKey
        // отдельным запросом (verify-flow одноразовый, OTP уже консумирован).
        const { publicKey, privateKey } = await generateKeyPair();
        // Кладём токен В STORE сразу, чтобы PATCH ушёл с Authorization.
        cachePlaintext(t.user.id, privateKey);
        setAuth({ ...t.user, publicKey } as any, t.accessToken, privateKey);
        initSocket();
        // Обновляем publicKey на сервере (без него собеседники не могут писать нам).
        await api.patch('/users/me/public-key', { publicKey }).catch(() => {
          // Если не получилось — приват уже сохранён, новые исходящие будут зашифрованы
          // для нашего НОВОГО publicKey, но входящие → бэк держит старый → fail.
          // Логируем, но не блокируем — юзер дальше зайдёт.
          console.warn('[phone-auth] failed to rotate publicKey on server');
        });
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message;
      const code = err?.response?.data?.error?.code;
      if (code === 'OTP_EXPIRED') {
        setError('Срок действия кода истёк. Запросите новый.');
      } else if (code === 'OTP_LOCKED') {
        setError('Слишком много неверных попыток. Запросите новый код.');
      } else {
        setError(msg ?? 'Неверный код');
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Шаг 3: завершение профиля (только для новых) ──────────────────────────
  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { publicKey, privateKey } = await generateKeyPair();
      const { data } = await api.post<{ success: boolean; data: CompleteResp }>(
        '/auth/phone/complete-profile',
        {
          verifyToken,
          displayName: displayName.trim(),
          username: username.trim() || undefined,
          publicKey,
        },
      );
      // КРИТИЧНО: сохранить приватный ключ в sessionStorage чтобы он пережил
      // reload вкладки. Без этого после F5 у юзера privateKey=null и все
      // E2E-чаты ломаются ("приватный ключ недоступен. Перелогиньтесь").
      cachePlaintext(data.data.user.id, privateKey);
      setAuth(data.data.user as any, data.data.tokens.accessToken, privateKey);
      initSocket();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Не удалось завершить регистрацию');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendIn > 0) return;
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<{ success: boolean; data: RequestCodeResp }>(
        '/auth/phone/request',
        { phone },
      );
      setResendIn(data.data.cooldownSec);
      setDevOtpHint(data.data.devOtp ?? null);
      if (data.data.telegramDeepLink) {
        setTgDeepLink(data.data.telegramDeepLink);
        setStep('link-bot');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Не удалось переслать код');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        className="space-y-5"
      >
        {step === 'phone' && (
          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <h2 className="text-white text-xl font-semibold leading-tight">
              Введите ваш номер
            </h2>
            <p className="text-white/50 text-sm">
              Мы отправим одноразовый код через Telegram.
            </p>

            <label className="block">
              <div className="text-white/55 text-xs mb-1.5">Номер телефона</div>
              <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] focus-within:border-primary-400/50 rounded-xl px-4 py-3.5 transition">
                <Phone size={16} className="text-white/40" />
                <input
                  autoFocus
                  inputMode="tel"
                  placeholder="+7 999 123-45-67"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-white placeholder:text-white/30"
                />
              </div>
            </label>

            {error && <FieldError message={error} />}

            <BrandSubmit loading={loading} disabled={phone.trim().length < 5}>
              Отправить код <ArrowRight size={16} />
            </BrandSubmit>
          </form>
        )}

        {step === 'link-bot' && tgDeepLink && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => { setStep('phone'); setTgDeepLink(null); setError(null); }}
              className="text-white/45 hover:text-white/80 text-xs"
            >
              ← Сменить номер
            </button>

            <h2 className="text-white text-xl font-semibold leading-tight">
              Откройте Dakka-бот в Telegram
            </h2>
            <p className="text-white/50 text-sm">
              Это разовое действие. Откройте бота, нажмите <span className="text-white/80">Start</span>,
              затем поделитесь номером. Код придёт прямо в этот чат.
            </p>

            <a
              href={tgDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-[#229ED9] text-white font-medium
                         py-3.5 rounded-xl shadow-lg active:scale-[0.98] transition"
            >
              <Send size={16} /> Открыть Telegram
            </a>

            <ol className="text-white/55 text-xs space-y-1.5 px-1">
              <li><span className="text-white/80">1.</span> Telegram откроется — нажмите «Start»</li>
              <li><span className="text-white/80">2.</span> Бот покажет кнопку «Поделиться номером» — нажмите её</li>
              <li><span className="text-white/80">3.</span> В чате с ботом появится код</li>
              <li><span className="text-white/80">4.</span> Вернитесь сюда и нажмите «У меня есть код»</li>
            </ol>

            <button
              type="button"
              onClick={() => setStep('code')}
              className="w-full bg-brand-gradient text-white font-medium py-3.5 rounded-xl shadow-glow-violet
                         transition active:scale-[0.98] flex items-center justify-center gap-2"
            >
              У меня есть код <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <button
              type="button"
              onClick={() => { setStep('phone'); setCode(''); setError(null); }}
              className="text-white/45 hover:text-white/80 text-xs"
            >
              ← Сменить номер
            </button>
            <h2 className="text-white text-xl font-semibold leading-tight">
              Введите код
            </h2>
            <p className="text-white/50 text-sm">
              Мы отправили 6-значный код на <span className="text-white/80">{phone}</span>
            </p>

            {devOtpHint && (
              <div className="text-amber-300/80 text-xs bg-amber-400/[0.06] border border-amber-400/[0.18] rounded-lg px-3 py-2">
                Dev-режим: код <span className="font-mono">{devOtpHint}</span>
              </div>
            )}

            <label className="block">
              <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] focus-within:border-primary-400/50 rounded-xl px-4 py-3.5 transition">
                <KeyRound size={16} className="text-white/40" />
                <input
                  ref={codeInputRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123 456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="flex-1 bg-transparent outline-none text-white text-lg tracking-[0.4em] placeholder:text-white/30"
                />
              </div>
            </label>

            {error && <FieldError message={error} />}

            <BrandSubmit loading={loading} disabled={code.length < 4}>
              Подтвердить <ArrowRight size={16} />
            </BrandSubmit>

            <button
              type="button"
              onClick={handleResend}
              disabled={resendIn > 0 || loading}
              className="block w-full text-center text-xs text-white/55 hover:text-white/80 disabled:text-white/30"
            >
              {resendIn > 0
                ? `Отправить новый код можно через ${resendIn}s`
                : 'Отправить новый код'}
            </button>
          </form>
        )}

        {step === 'profile' && (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <h2 className="text-white text-xl font-semibold leading-tight">
              Расскажите о себе
            </h2>
            <p className="text-white/50 text-sm">
              Эти данные увидят люди, с которыми вы переписываетесь.
            </p>

            <label className="block">
              <div className="text-white/55 text-xs mb-1.5">Имя</div>
              <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] focus-within:border-primary-400/50 rounded-xl px-4 py-3.5 transition">
                <UserIcon size={16} className="text-white/40" />
                <input
                  autoFocus
                  placeholder="Иван Иванов"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, 64))}
                  className="flex-1 bg-transparent outline-none text-white placeholder:text-white/30"
                />
              </div>
            </label>

            <label className="block">
              <div className="text-white/55 text-xs mb-1.5">Username — необязательно</div>
              <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] focus-within:border-primary-400/50 rounded-xl px-4 py-3.5 transition">
                <span className="text-white/40">@</span>
                <input
                  placeholder="ivan"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32))}
                  className="flex-1 bg-transparent outline-none text-white placeholder:text-white/30"
                />
              </div>
            </label>

            {error && <FieldError message={error} />}

            <BrandSubmit loading={loading} disabled={displayName.trim().length < 1}>
              Готово <ArrowRight size={16} />
            </BrandSubmit>
          </form>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function BrandSubmit({
  children, loading, disabled,
}: { children: React.ReactNode; loading: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full bg-brand-gradient text-white font-medium py-3.5 rounded-xl shadow-glow-violet
                 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
                 flex items-center justify-center gap-2"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : children}
    </button>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-rose-300/95 text-xs bg-rose-500/[0.08] border border-rose-500/[0.22] rounded-lg px-3 py-2"
    >
      {message}
    </motion.div>
  );
}
