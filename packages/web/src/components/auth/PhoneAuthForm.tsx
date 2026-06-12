import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, KeyRound, Lock, User as UserIcon, Loader2, Send } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { generateKeyPair } from '@/lib/crypto';
import { cachePlaintext, getCached as getCachedPrivKey } from '@/lib/keyVault';
import { initSocket } from '@/lib/socket';
import { SPRING, EASE, tap } from '@/lib/motion';
import CountryPicker, { DEFAULT_COUNTRY, parsePhoneInput, type Country } from './CountryPicker';

// P1-9: persist deviceId per-browser. Без этого бэк фоллбэчит на новый uuidv4
// при каждом /verify и /complete-profile, и таблица Session растёт бесконтрольно —
// «активные устройства» врёт, старые refresh tokens живут до истечения.
function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem('deviceId');
    if (!id) { id = uuidv4(); localStorage.setItem('deviceId', id); }
    return id;
  } catch {
    return uuidv4();
  }
}
const DEVICE_NAME = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 64) : 'web';

// Бэк не отдаёт статус облачного пароля в /me, поэтому кэшируем его per-user
// в localStorage: пишется при входе здесь и при изменениях в SettingsDialog.
function setCloudPasswordFlag(userId: string, set: boolean) {
  try { localStorage.setItem(`cloudpwd:${userId}`, set ? '1' : '0'); } catch { /* инкогнито */ }
}

type Step = 'phone' | 'link-bot' | 'code' | 'password' | 'profile';

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
  /** Облачный пароль установлен — токены не выданы, нужен шаг 'password' */
  passwordRequired?: boolean;
  passwordToken?: string;
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
  // phone хранит ЛОКАЛЬНУЮ часть (без dial-кода). К нему конкатенируется country.dialCode.
  // localStorage: запоминаем выбор страны для повторных входов.
  const [country, setCountry] = useState<Country>(() => {
    try {
      const saved = localStorage.getItem('auth:country');
      if (saved) {
        const parsed = JSON.parse(saved) as Country;
        if (parsed?.code && parsed?.dialCode) return parsed;
      }
    } catch { /* ignore */ }
    return DEFAULT_COUNTRY;
  });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  // Собранный E.164-номер для отправки на бэк (бэкенд нормализует через libphonenumber).
  const fullPhone = `${country.dialCode}${phone.replace(/\D/g, '')}`;
  const [verifyToken, setVerifyToken] = useState<string | null>(null);

  // Облачный пароль (второй шаг после verify, если установлен)
  const [passwordToken, setPasswordToken] = useState<string | null>(null);
  const [cloudPassword, setCloudPassword] = useState('');

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
      // Запоминаем выбранную страну для следующих сессий.
      try { localStorage.setItem('auth:country', JSON.stringify(country)); } catch { /* ignore */ }
      const { data } = await api.post<{ success: boolean; data: RequestCodeResp }>(
        '/auth/phone/request',
        { phone: fullPhone },
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

  // Общий финал входа существующего юзера (verify без пароля / password-шаг):
  // keyVault-логика — кэшированный приватный ключ или регенерация пары + PATCH.
  async function finishExistingLogin(t: TokensPayload & { user: UserPayload }) {
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
      cachePlaintext(t.user.id, privateKey);

      // КРИТИЧНО: PATCH публичного ключа ДО initSocket. Иначе между шагами
      // setAuth/initSocket и PATCH собеседник может отправить нам сообщение,
      // зашифрованное под СТАРЫЙ pubKey → расшифровать не получится никогда.
      // Шлём axios напрямую с accessToken через header (минуя store/interceptor,
      // т.к. setAuth ещё не вызван — interceptor токен не найдёт).
      const patchOk = await api.patch(
        '/users/me/public-key',
        { publicKey },
        { headers: { Authorization: `Bearer ${t.accessToken}` } },
      ).then(() => true).catch(() => false);

      if (!patchOk) {
        // Без PATCH — все входящие = "Не удалось расшифровать". Прерываем,
        // даём юзеру попробовать ещё раз через переotправку кода.
        throw new Error('Не удалось обновить ключ шифрования. Попробуйте ещё раз.');
      }

      // Теперь безопасно — на сервере новый pubKey, входящие будут зашифрованы
      // под него, мы дешифруем приватным ключом.
      setAuth({ ...t.user, publicKey } as any, t.accessToken, privateKey);
      initSocket();
    }
  }

  // ── Шаг 2: проверка кода ──────────────────────────────────────────────────
  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Verify без publicKey — бэк ничего не меняет в user.publicKey.
      // P1-9: deviceId + deviceName — иначе каждый /verify = orphan-сессия.
      const r = await api.post<{ success: boolean; data: VerifyResp }>(
        '/auth/phone/verify',
        { phone: fullPhone, code, deviceId: getOrCreateDeviceId(), deviceName: DEVICE_NAME },
      );
      const v = r.data.data;

      if (v.isNewUser) {
        setVerifyToken(v.verifyToken!);
        setStep('profile');
        return;
      }

      // Аккаунт защищён облачным паролем — токенов нет, второй шаг.
      if (v.passwordRequired) {
        setPasswordToken(v.passwordToken!);
        setCloudPassword('');
        setStep('password');
        return;
      }

      const t = v.tokens!;
      setCloudPasswordFlag(t.user.id, false); // вошли без пароля → не установлен
      await finishExistingLogin(t);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message;
      const code = err?.response?.data?.error?.code;
      if (code === 'OTP_EXPIRED') {
        setError('Срок действия кода истёк. Запросите новый.');
      } else if (code === 'OTP_LOCKED') {
        setError('Слишком много неверных попыток. Запросите новый код.');
      } else {
        setError(msg ?? err?.message ?? 'Неверный код');
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Шаг 2б: облачный пароль ───────────────────────────────────────────────
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api.post<{ success: boolean; data: VerifyResp }>(
        '/auth/phone/password',
        { passwordToken, password: cloudPassword, deviceId: getOrCreateDeviceId(), deviceName: DEVICE_NAME },
      );
      const t = r.data.data.tokens!;
      setCloudPasswordFlag(t.user.id, true); // вход потребовал пароль → установлен
      await finishExistingLogin(t);
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      if (code === 'WRONG_PASSWORD') {
        setError('Неверный пароль. Попробуйте ещё раз.');
      } else if (code === 'TOO_MANY_ATTEMPTS') {
        setError('Слишком много неверных попыток. Запросите новый код и войдите заново.');
      } else if (code === 'PASSWORD_TOKEN_INVALID') {
        setError('Сессия входа истекла. Запросите код заново.');
      } else {
        setError(err?.response?.data?.error?.message ?? err?.message ?? 'Не удалось войти');
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
          deviceId: getOrCreateDeviceId(),
          deviceName: DEVICE_NAME,
        },
      );
      // КРИТИЧНО: сохранить приватный ключ в sessionStorage чтобы он пережил
      // reload вкладки. Без этого после F5 у юзера privateKey=null и все
      // E2E-чаты ломаются ("приватный ключ недоступен. Перелогиньтесь").
      cachePlaintext(data.data.user.id, privateKey);
      setCloudPasswordFlag(data.data.user.id, false); // новый аккаунт — пароля нет
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
        { phone: fullPhone },
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
        initial={{ opacity: 0, x: 24, filter: 'blur(4px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, x: -24, filter: 'blur(4px)' }}
        transition={{ duration: 0.3, ease: EASE.soft }}
        className="space-y-5"
      >
        {step === 'phone' && (
          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <h2 className="text-content text-xl font-semibold leading-tight">
              Введите ваш номер
            </h2>
            <p className="text-content/50 text-sm">
              Мы отправим одноразовый код через Telegram.
            </p>

            <label className="block">
              <div className="text-content/55 text-xs mb-1.5">Номер телефона</div>
              <div className="flex items-center gap-2 bg-content/[0.04] border border-dark-border rounded-xl pl-2 pr-4 h-14
                              transition-colors focus-within:border-primary-400/50 focus-within:bg-content/[0.05]
                              focus-within:ring-2 focus-within:ring-primary-500/15">
                <CountryPicker value={country} onChange={setCountry} />
                <span className="w-px h-6 bg-content/10" aria-hidden />
                <input
                  autoFocus
                  inputMode="tel"
                  placeholder="999 123 45 67"
                  value={phone}
                  onChange={(e) => {
                    // Умный парсер: +код → автоопределение страны, 8 → strip для RU.
                    const { country: c, local } = parsePhoneInput(e.target.value, country);
                    if (c.code !== country.code) setCountry(c);
                    setPhone(local);
                  }}
                  className="flex-1 min-w-0 bg-transparent outline-none text-content text-[15px] placeholder:text-content/30 tabular-nums"
                />
              </div>
            </label>

            <FieldError message={error} />

            <BrandSubmit loading={loading} disabled={phone.replace(/\D/g, '').length < 6}>
              Отправить код <ArrowRight size={16} />
            </BrandSubmit>
          </form>
        )}

        {step === 'link-bot' && tgDeepLink && (
          <div className="space-y-4">
            <BackButton onClick={() => { setStep('phone'); setTgDeepLink(null); setError(null); }} />

            <h2 className="text-content text-xl font-semibold leading-tight">
              Откройте Dakka-бот в Telegram
            </h2>
            <p className="text-content/50 text-sm">
              Это разовое действие. Откройте бота, нажмите <span className="text-content/80">Start</span>,
              затем поделитесь номером. Код придёт прямо в этот чат.
            </p>

            <motion.a
              href={tgDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              whileTap={tap}
              whileHover={{ scale: 1.01 }}
              transition={SPRING.snappy}
              className="flex items-center justify-center gap-2 w-full h-12 bg-[#229ED9] text-white font-medium
                         rounded-xl shadow-[0_10px_30px_-12px_rgba(34,158,217,0.7)] hover:brightness-105 transition-[filter]"
            >
              <Send size={16} /> Открыть Telegram
            </motion.a>

            <ol className="text-content/55 text-xs space-y-2 rounded-xl bg-content/[0.03] border border-dark-border p-3">
              {[
                'Telegram откроется — нажмите «Start»',
                'Бот покажет кнопку «Поделиться номером» — нажмите её',
                'В чате с ботом появится код',
                'Вернитесь сюда и нажмите «У меня есть код»',
              ].map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex-shrink-0 grid place-items-center w-5 h-5 rounded-full bg-primary-500/15
                                   text-primary-600 dark:text-primary-300 text-[11px] font-semibold tabular-nums">{i + 1}</span>
                  <span className="pt-0.5 leading-snug">{t}</span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => setStep('code')}
              className="btn-primary btn-block"
            >
              У меня есть код <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <BackButton onClick={() => { setStep('phone'); setCode(''); setError(null); }} />
            <h2 className="text-content text-xl font-semibold leading-tight">
              Введите код
            </h2>
            <p className="text-content/50 text-sm">
              Мы отправили 6-значный код на <span className="text-content/80 tabular-nums">{fullPhone}</span>
            </p>

            {devOtpHint && ((import.meta as any).env?.DEV) && (
              <div className="text-amber-300/80 text-xs bg-amber-400/[0.06] border border-amber-400/[0.18] rounded-lg px-3 py-2">
                Dev-режим: код <span className="font-mono">{devOtpHint}</span>
              </div>
            )}

            {/* Крупный моноширинный центрированный код-инпут */}
            <label className="block">
              <div className="flex items-center gap-3 bg-content/[0.04] border border-dark-border rounded-xl h-16 px-4
                              transition-colors focus-within:border-primary-400/50 focus-within:bg-content/[0.05]
                              focus-within:ring-2 focus-within:ring-primary-500/15">
                <KeyRound size={18} className="text-content/35 flex-shrink-0" />
                <input
                  ref={codeInputRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="• • • • • •"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="flex-1 min-w-0 bg-transparent outline-none text-center text-content text-2xl font-mono
                             font-semibold tracking-[0.35em] tabular-nums placeholder:text-content/20 placeholder:tracking-[0.2em]"
                />
              </div>
            </label>

            <FieldError message={error} />

            <BrandSubmit loading={loading} disabled={code.length < 4}>
              Подтвердить <ArrowRight size={16} />
            </BrandSubmit>

            <button
              type="button"
              onClick={handleResend}
              disabled={resendIn > 0 || loading}
              className="block w-full text-center text-xs text-content/55 hover:text-content/85 disabled:text-content/30
                         disabled:cursor-not-allowed transition-colors py-1"
            >
              {resendIn > 0
                ? <>Отправить новый код можно через <span className="tabular-nums text-content/70">{resendIn}s</span></>
                : 'Отправить новый код'}
            </button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <BackButton onClick={() => {
              // OTP уже консумирован — назад только через новый код.
              setStep('phone'); setCode(''); setCloudPassword(''); setPasswordToken(null); setError(null);
            }} />
            <h2 className="text-content text-xl font-semibold leading-tight">
              Облачный пароль
            </h2>
            <p className="text-content/50 text-sm">
              Аккаунт защищён дополнительным паролем. Введите его, чтобы войти.
            </p>

            <label className="block">
              <div className="flex items-center gap-3 bg-content/[0.04] border border-dark-border rounded-xl px-4 h-14
                              transition-colors focus-within:border-primary-400/50 focus-within:bg-content/[0.05]
                              focus-within:ring-2 focus-within:ring-primary-500/15">
                <Lock size={16} className="text-content/40 flex-shrink-0" />
                <input
                  autoFocus
                  type="password"
                  autoComplete="current-password"
                  placeholder="Пароль"
                  value={cloudPassword}
                  onChange={(e) => setCloudPassword(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent outline-none text-content text-[15px] placeholder:text-content/30"
                />
              </div>
            </label>

            <FieldError message={error} />

            <BrandSubmit loading={loading} disabled={cloudPassword.length < 1}>
              Войти <ArrowRight size={16} />
            </BrandSubmit>
          </form>
        )}

        {step === 'profile' && (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <h2 className="text-content text-xl font-semibold leading-tight">
              Расскажите о себе
            </h2>
            <p className="text-content/50 text-sm">
              Эти данные увидят люди, с которыми вы переписываетесь.
            </p>

            <label className="block">
              <div className="text-content/55 text-xs mb-1.5">Имя</div>
              <div className="flex items-center gap-3 bg-content/[0.04] border border-dark-border rounded-xl px-4 h-14
                              transition-colors focus-within:border-primary-400/50 focus-within:bg-content/[0.05]
                              focus-within:ring-2 focus-within:ring-primary-500/15">
                <UserIcon size={16} className="text-content/40 flex-shrink-0" />
                <input
                  autoFocus
                  placeholder="Иван Иванов"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, 64))}
                  className="flex-1 min-w-0 bg-transparent outline-none text-content text-[15px] placeholder:text-content/30"
                />
              </div>
            </label>

            <label className="block">
              <div className="text-content/55 text-xs mb-1.5">Username — необязательно</div>
              <div className="flex items-center gap-3 bg-content/[0.04] border border-dark-border rounded-xl px-4 h-14
                              transition-colors focus-within:border-primary-400/50 focus-within:bg-content/[0.05]
                              focus-within:ring-2 focus-within:ring-primary-500/15">
                <span className="text-content/40 flex-shrink-0">@</span>
                <input
                  placeholder="ivan"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32))}
                  className="flex-1 min-w-0 bg-transparent outline-none text-content text-[15px] placeholder:text-content/30"
                />
              </div>
            </label>

            <FieldError message={error} />

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
    <button type="submit" disabled={loading || disabled} className="btn-primary btn-block">
      {loading ? <Loader2 size={16} className="animate-spin" /> : children}
    </button>
  );
}

// Единая кнопка «Назад» для шагов: иконка-чип + текст, hit-target, мягкий tap.
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={tap}
      transition={SPRING.snappy}
      className="group -ml-1 inline-flex items-center gap-1.5 h-8 pr-2 pl-1 rounded-lg text-content/45
                 hover:text-content/85 hover:bg-content/[0.04] focus-visible:outline-none
                 focus-visible:ring-2 focus-visible:ring-primary-500/30 transition-colors"
    >
      <ArrowLeft size={15} className="transition-transform group-hover:-translate-x-0.5" />
      <span className="text-xs">Сменить номер</span>
    </motion.button>
  );
}

function FieldError({ message }: { message: string | null }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          initial={{ opacity: 0, height: 0, y: -4 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -4 }}
          transition={{ duration: 0.22, ease: EASE.out }}
          className="overflow-hidden"
        >
          <div className="text-rose-300/95 text-xs bg-rose-500/[0.08] border border-rose-500/[0.22] rounded-lg px-3 py-2">
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
