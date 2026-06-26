import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, ShieldOff, Loader2, Copy, Check, KeyRound, QrCode as QrCodeIcon, Moon, Sun, Monitor, Phone } from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { copySensitive } from '@/lib/sensitiveClipboard';
import { getStoredMode, setMode, type ThemeMode } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { getStoredLang, setLang, type Lang } from '@/lib/i18n';
import IconBtn from '@/components/ui/IconBtn';
import QRCodeModal from '@/components/ui/QRCodeModal';
import SettingsPrivacy from '@/components/settings/SettingsPrivacy';
import SettingsSessions from '@/components/settings/SettingsSessions';
import SettingsBlocked from '@/components/settings/SettingsBlocked';
import SettingsDanger from '@/components/settings/SettingsDanger';
import { backdrop, popIn, fadeUp, listParent, tap, SPRING } from '@/lib/motion';

interface Props { open: boolean; onClose: () => void; }

type Status = { enabled: boolean; remainingRecoveryCodes: number } | null;

export default function SettingsDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>(null);
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (!open) return;
    api.get('/auth/2fa/status').then(({ data }) => setStatus(data.data));
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={backdrop}
          initial="hidden" animate="visible" exit="exit"
          className="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            variants={popIn}
            initial="hidden" animate="visible" exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="relative z-modal bg-dark-card border border-dark-border rounded-3xl shadow-e3 w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 h-16 border-b border-dark-border bg-dark-card/80 backdrop-blur-xl flex-shrink-0 z-header">
              <h3 className="font-semibold text-base">{t('settings.title')}</h3>
              <IconBtn size="sm" onClick={onClose}><X size={16} /></IconBtn>
            </div>

            <motion.div
              variants={listParent}
              initial="hidden" animate="visible"
              className="flex-1 overflow-y-auto p-4 space-y-3"
            >
              <motion.section variants={fadeUp} className="surface-1 rounded-2xl p-4 shadow-e2">
                <SectionTitle>{t('settings.appearance')}</SectionTitle>
                <AppearanceSection />
              </motion.section>

              <motion.section variants={fadeUp} className="surface-1 rounded-2xl p-4 shadow-e2">
                <SectionTitle>{t('settings.profile')}</SectionTitle>
                <ProfileSection open={open} />
              </motion.section>

              <motion.section variants={fadeUp} className="surface-1 rounded-2xl p-4 shadow-e2 space-y-5">
                <SectionTitle>{t('settings.security')}</SectionTitle>
                <TwoFactorSection status={status} onChange={setStatus} />
                <div className="h-px bg-dark-border" aria-hidden />
                <CloudPasswordSection />
                <div className="h-px bg-dark-border" aria-hidden />
                <ChangePhoneSection />
              </motion.section>

              <motion.section variants={fadeUp} className="surface-1 rounded-2xl p-4 shadow-e2">
                <SettingsPrivacy />
              </motion.section>

              <motion.section variants={fadeUp} className="surface-1 rounded-2xl p-4 shadow-e2">
                <SettingsSessions />
              </motion.section>

              <motion.section variants={fadeUp} className="surface-1 rounded-2xl p-4 shadow-e2">
                <SettingsBlocked />
              </motion.section>

              <motion.section variants={fadeUp} className="rounded-2xl p-4 border border-red-500/25 bg-red-500/[0.04] shadow-e2">
                {/* passwordSet — локальный cloudpwd-флаг (тот же паттерн, что в CloudPasswordSection) */}
                <SettingsDanger passwordSet={getCloudPwdFlag(userId)} />
              </motion.section>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Uppercase-заголовок секции по дизайн-системе (12px, tracking-wider, content/55). */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 px-0.5">
      <span className="text-[12px] uppercase tracking-wider font-semibold text-content/55">{children}</span>
    </div>
  );
}

// ─── Внешний вид: переключатель темы (Тёмная / Светлая / Авто) ────────────────
// Сегментированный контрол с «пилюлей»-подсветкой активного режима.
const THEME_OPTIONS: { mode: ThemeMode; key: string; Icon: typeof Moon }[] = [
  { mode: 'dark',  key: 'settings.themeDark',  Icon: Moon },
  { mode: 'light', key: 'settings.themeLight', Icon: Sun },
  { mode: 'auto',  key: 'settings.themeAuto',  Icon: Monitor },
];

const LANG_OPTIONS: { lang: Lang; label: string }[] = [
  { lang: 'ru', label: 'Русский' },
  { lang: 'en', label: 'English' },
  { lang: 'ar', label: 'العربية' },
];

function AppearanceSection() {
  const { t } = useTranslation();
  const [mode, setLocalMode] = useState<ThemeMode>(() => getStoredMode());
  const [lang, setLocalLang] = useState<Lang>(() => getStoredLang());

  const choose = (m: ThemeMode) => {
    setLocalMode(m);
    setMode(m); // применяет data-theme + сохраняет в localStorage
  };
  const chooseLang = (l: Lang) => {
    setLocalLang(l);
    setLang(l); // меняет язык i18next + сохраняет
  };

  return (
    <div className="space-y-3">
      <div className="relative grid grid-cols-3 gap-1 p-1 rounded-xl bg-content/[0.05] border border-dark-border">
        {THEME_OPTIONS.map(({ mode: m, key, Icon }) => {
          const active = mode === m;
          // БЕЗ layoutId: framer layoutId + AnimatePresence exit могли задедлочиться,
          // если закрыть настройки сразу после смены темы (пилюля ещё анимируется) →
          // backdrop не размонтировался → «экран не кликается». Просто красим активную.
          return (
            <button
              key={m}
              onClick={() => choose(m)}
              className={`relative flex flex-col items-center justify-center gap-1.5 h-16 rounded-lg transition-colors ${
                active
                  ? 'bg-brand-gradient shadow-glow-violet text-white'
                  : 'text-content/60 hover:text-content/90'
              }`}
            >
              <Icon size={20} />
              <span className="text-[12px] font-medium">{t(key)}</span>
            </button>
          );
        })}
      </div>

      {/* Язык интерфейса — ровный сегмент-контрол из 3 на своей строке. */}
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-content/60">{t('settings.language')}</span>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-content/[0.05] border border-dark-border">
          {LANG_OPTIONS.map(({ lang: l, label }) => {
            const active = lang === l;
            return (
              <button key={l} onClick={() => chooseLang(l)}
                className={`flex items-center justify-center h-9 rounded-lg text-[13px] font-medium transition-colors ${
                  active ? 'bg-brand-gradient shadow-glow-violet text-white' : 'text-content/60 hover:text-content/90'
                }`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Профиль: bio + мой QR-код ───────────────────────────────────────────────
// В auth.store bio не хранится — подтягиваем актуальное значение с бэка
// при каждом открытии настроек (GET /users/:id отдаёт bio).

function ProfileSection({ open }: { open: boolean }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [bio,      setBio]      = useState('');
  const [savedBio, setSavedBio] = useState('');
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState('');
  const [ok,       setOk]       = useState('');
  const [showQR,   setShowQR]   = useState(false);

  useEffect(() => {
    if (!open || !user?.id) return;
    api.get(`/users/${user.id}`)
      .then(({ data }) => {
        const b: string = data.data?.bio ?? '';
        setBio(b);
        setSavedBio(b);
      })
      .catch(() => {});
  }, [open, user?.id]);

  const dirty = bio !== savedBio;

  const save = async () => {
    setBusy(true); setErr(''); setOk('');
    try {
      const { data } = await api.patch('/users/me', { bio: bio.trim() });
      const b: string = data.data?.bio ?? bio.trim();
      setBio(b);
      setSavedBio(b);
      setOk(t('settings.saved'));
    } catch (e: unknown) {
      setErr(errMsg(e, t('settings.saveFailed')));
    } finally { setBusy(false); }
  };

  const qrValue = user?.username ? `${window.location.origin}/u/${user.username}` : null;

  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-semibold text-sm">{t('settings.bio')}</h4>
        <textarea
          value={bio}
          onChange={(e) => { setBio(e.target.value.slice(0, 140)); setOk(''); setErr(''); }}
          placeholder={t('settings.bioPlaceholder')}
          rows={2}
          maxLength={140}
          className="input-base w-full mt-2 resize-none"
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[12px] text-content/35 tabular-nums">{bio.length}/140</span>
          <motion.button
            onClick={save}
            disabled={busy || !dirty}
            whileTap={tap}
            transition={SPRING.snappy}
            className="btn-primary btn-sm disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('common.save')}
          </motion.button>
        </div>
        {err && <p className="text-red-400 text-sm mt-1">{err}</p>}
        {ok  && <p className="text-green-400 text-sm mt-1">{ok}</p>}
      </div>

      {qrValue && (
        <motion.button
          onClick={() => setShowQR(true)}
          whileTap={tap}
          transition={SPRING.snappy}
          className="btn-secondary btn-block"
        >
          <QrCodeIcon size={15} />
          {t('settings.myQr')}
        </motion.button>
      )}

      <AnimatePresence>
        {showQR && qrValue && user && (
          <QRCodeModal
            value={qrValue}
            title={user.displayName}
            subtitle={`@${user.username}`}
            onClose={() => setShowQR(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── 2FA секция ──────────────────────────────────────────────────────────────

function TwoFactorSection({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  const { t } = useTranslation();
  const [setup,  setSetup]  = useState<{ secret: string; qr: string } | null>(null);
  const [code,   setCode]   = useState('');
  const [busy,   setBusy]   = useState(false);
  const [err,    setErr]    = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const [disablePwd,  setDisablePwd]  = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const startSetup = async () => {
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/2fa/setup');
      const qr = await QRCode.toDataURL(data.data.otpauthUrl, { margin: 1, scale: 4 });
      setSetup({ secret: data.data.secret, qr });
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t('settings.error'));
    } finally { setBusy(false); }
  };

  const confirmEnable = async () => {
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/2fa/enable', { code: code.trim() });
      setRecoveryCodes(data.data.recoveryCodes);
      setSetup(null);
      setCode('');
      const fresh = await api.get('/auth/2fa/status');
      onChange(fresh.data.data);
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t('settings.wrongCode'));
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true); setErr('');
    try {
      await api.post('/auth/2fa/disable', { password: disablePwd, code: disableCode.trim() });
      const fresh = await api.get('/auth/2fa/status');
      onChange(fresh.data.data);
      setShowDisable(false);
      setDisablePwd(''); setDisableCode('');
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t('settings.error'));
    } finally { setBusy(false); }
  };

  // ── Показ recovery codes после включения ───────────────────────────────────
  if (recoveryCodes) {
    return (
      <RecoveryCodesView codes={recoveryCodes} onDone={() => setRecoveryCodes(null)} />
    );
  }

  // ── Setup-флоу (QR + код подтверждения) ────────────────────────────────────
  if (setup) {
    return (
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold text-sm mb-1">{t('settings.twoFaStep1')}</h4>
          <p className="text-xs text-content/50">{t('settings.twoFaStep1Hint')}</p>
        </div>
        <div className="bg-white p-3 rounded-2xl flex items-center justify-center shadow-e2">
          <img src={setup.qr} alt="QR" className="w-48 h-48" />
        </div>
        <div>
          <p className="text-xs text-content/40 mb-1">{t('settings.twoFaManual')}</p>
          <code className="block bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono break-all text-content/80">
            {setup.secret}
          </code>
        </div>

        <div className="border-t border-dark-border pt-4">
          <h4 className="font-semibold text-sm mb-2">{t('settings.twoFaStep2')}</h4>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            className="input-base w-full text-center tracking-widest font-mono"
          />
        </div>

        {err && <p className="text-red-400 text-sm">{err}</p>}

        <div className="flex gap-2">
          <motion.button
            onClick={() => setSetup(null)}
            whileTap={tap}
            transition={SPRING.snappy}
            className="btn-secondary flex-1"
          >
            {t('common.cancel')}
          </motion.button>
          <motion.button
            onClick={confirmEnable}
            disabled={busy || code.length < 6}
            whileTap={tap}
            transition={SPRING.snappy}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('settings.enable')}
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Disable-флоу ───────────────────────────────────────────────────────────
  if (showDisable) {
    return (
      <div className="space-y-4">
        <h4 className="font-semibold text-sm">{t('settings.disableTitle')}</h4>
        <p className="text-xs text-content/50">{t('settings.disableHint')}</p>
        <input
          type="password"
          value={disablePwd}
          onChange={(e) => setDisablePwd(e.target.value)}
          placeholder={t('settings.password')}
          className="input-base w-full"
        />
        <input
          value={disableCode}
          onChange={(e) => setDisableCode(e.target.value)}
          placeholder={t('settings.codeFromApp')}
          inputMode="numeric"
          className="input-base w-full text-center tracking-widest font-mono"
        />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="flex gap-2">
          <motion.button onClick={() => setShowDisable(false)} whileTap={tap} transition={SPRING.snappy} className="btn-secondary flex-1">
            {t('common.cancel')}
          </motion.button>
          <motion.button onClick={disable} disabled={busy} whileTap={tap} transition={SPRING.snappy} className="btn-danger flex-1 disabled:opacity-50">
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('settings.disable')}
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Главный экран ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${status?.enabled ? 'text-green-400' : 'text-content/40'}`}>
          {status?.enabled ? <ShieldCheck size={22} /> : <ShieldOff size={22} />}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm">{t('settings.twoFactor')}</h4>
          <p className="text-xs text-content/50 mt-0.5">
            {status?.enabled
              ? t('settings.twoFactorOn', { n: status.remainingRecoveryCodes })
              : t('settings.twoFactorOff')}
          </p>
        </div>
      </div>

      {!status?.enabled ? (
        <motion.button
          onClick={startSetup}
          disabled={busy}
          whileTap={tap}
          transition={SPRING.snappy}
          className="btn-primary btn-block disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {t('settings.enable2fa')}
        </motion.button>
      ) : (
        <motion.button
          onClick={() => setShowDisable(true)}
          whileTap={tap}
          transition={SPRING.snappy}
          className="btn-secondary btn-block hover:bg-red-500/20 hover:text-red-400"
        >
          {t('settings.disable2fa')}
        </motion.button>
      )}

      {err && <p className="text-red-400 text-sm">{err}</p>}
    </div>
  );
}

// ─── Облачный пароль ─────────────────────────────────────────────────────────
// Бэк не отдаёт статус пароля в /me, поэтому кэшируем его per-user в
// localStorage (пишется также в PhoneAuthForm при входе). Если флаг устарел и
// бэк потребовал текущий пароль — раскрываем поле по факту ошибки.

function getCloudPwdFlag(userId?: string): boolean {
  try { return !!userId && localStorage.getItem(`cloudpwd:${userId}`) === '1'; } catch { return false; }
}
function setCloudPwdFlag(userId: string | undefined, v: boolean) {
  try { if (userId) localStorage.setItem(`cloudpwd:${userId}`, v ? '1' : '0'); } catch { /* инкогнито */ }
}
function errMsg(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}

function CloudPasswordSection() {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const [hasPassword, setHasPassword] = useState(() => getCloudPwdFlag(userId));
  const [mode, setMode] = useState<'idle' | 'edit' | 'delete'>('idle');
  const [current, setCurrent] = useState('');
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  const [ok,   setOk]   = useState('');
  // Локальный флаг устарел (PUT без currentPassword отбит) → показать поле
  const [needCurrent, setNeedCurrent] = useState(false);

  const askCurrent = hasPassword || needCurrent;

  const openMode = (m: 'edit' | 'delete') => {
    setCurrent(''); setPwd1(''); setPwd2(''); setErr(''); setOk(''); setMode(m);
  };
  const closeForm = () => { setCurrent(''); setPwd1(''); setPwd2(''); setErr(''); setMode('idle'); };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api.put('/users/me/cloud-password', {
        ...(askCurrent ? { currentPassword: current } : {}),
        newPassword: pwd1,
      });
      setCloudPwdFlag(userId, true);
      setOk(hasPassword ? t('settings.pwdChanged') : t('settings.cloudSet'));
      setHasPassword(true);
      setNeedCurrent(false);
      closeForm();
    } catch (e: unknown) {
      // Бэк требует текущий пароль, а мы его не слали — флаг устарел.
      if (!askCurrent) setNeedCurrent(true);
      setErr(errMsg(e, t('settings.cloudSaveFailed')));
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setErr('');
    try {
      await api.delete('/users/me/cloud-password', { data: { currentPassword: current } });
      setCloudPwdFlag(userId, false);
      setOk(t('settings.cloudRemoved'));
      setHasPassword(false);
      setNeedCurrent(false);
      closeForm();
    } catch (e: unknown) {
      setErr(errMsg(e, t('settings.cloudRemoveFailed')));
    } finally { setBusy(false); }
  };

  // ── Форма установки/смены ──────────────────────────────────────────────────
  if (mode === 'edit') {
    const mismatch = pwd2.length > 0 && pwd1 !== pwd2;
    return (
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">{hasPassword ? t('settings.changeCloudTitle') : t('settings.setCloudTitle')}</h4>
        <p className="text-xs text-content/50">{t('settings.cloudPwdFormHint')}</p>
        {askCurrent && (
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder={t('settings.currentPwd')}
            autoComplete="current-password"
            className="input-base w-full"
          />
        )}
        <input
          type="password"
          value={pwd1}
          onChange={(e) => setPwd1(e.target.value)}
          placeholder={t('settings.newPwd')}
          autoComplete="new-password"
          className="input-base w-full"
        />
        <input
          type="password"
          value={pwd2}
          onChange={(e) => setPwd2(e.target.value)}
          placeholder={t('settings.repeatPwd')}
          autoComplete="new-password"
          className="input-base w-full"
        />
        {mismatch && <p className="text-red-400 text-xs">{t('settings.pwdMismatch')}</p>}
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="flex gap-2">
          <motion.button onClick={closeForm} whileTap={tap} transition={SPRING.snappy} className="btn-secondary flex-1">
            {t('common.cancel')}
          </motion.button>
          <motion.button
            onClick={save}
            disabled={busy || pwd1.length < 8 || pwd1 !== pwd2 || (askCurrent && !current)}
            whileTap={tap}
            transition={SPRING.snappy}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('common.save')}
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Подтверждение удаления ─────────────────────────────────────────────────
  if (mode === 'delete') {
    return (
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">{t('settings.deleteCloudTitle')}</h4>
        <p className="text-xs text-content/50">{t('settings.deleteCloudHint')}</p>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder={t('settings.currentPwd')}
          autoComplete="current-password"
          className="input-base w-full"
        />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="flex gap-2">
          <motion.button onClick={closeForm} whileTap={tap} transition={SPRING.snappy} className="btn-secondary flex-1">
            {t('common.cancel')}
          </motion.button>
          <motion.button
            onClick={remove}
            disabled={busy || !current}
            whileTap={tap}
            transition={SPRING.snappy}
            className="btn-danger flex-1 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('common.delete')}
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Главный экран ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${hasPassword ? 'text-green-400' : 'text-content/40'}`}>
          <KeyRound size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm">{t('settings.cloudPwd')}</h4>
          <p className="text-xs text-content/50 mt-0.5">
            {hasPassword
              ? t('settings.cloudPwdOn')
              : t('settings.cloudPwdOff')}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <motion.button
          onClick={() => openMode('edit')}
          whileTap={tap}
          transition={SPRING.snappy}
          className="btn-primary flex-1"
        >
          {hasPassword ? t('settings.changePwd') : t('settings.setPwd')}
        </motion.button>
        {hasPassword && (
          <motion.button
            onClick={() => openMode('delete')}
            whileTap={tap}
            transition={SPRING.snappy}
            className="btn-secondary flex-1 hover:bg-red-500/20 hover:text-red-400"
          >
            {t('common.delete')}
          </motion.button>
        )}
      </div>

      {ok && <p className="text-green-400 text-sm">{ok}</p>}
    </div>
  );
}

// ─── Смена номера телефона ───────────────────────────────────────────────────
// Двухшаговый флоу: новый номер → код на новый номер (+ облачный пароль, если
// установлен). Бэк: POST /auth/phone/change/request → /confirm.

function ChangePhoneSection() {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const hasCloudPwd = getCloudPwdFlag(userId);

  const [stage, setStage] = useState<'idle' | 'phone' | 'code'>('idle');
  const [newPhone, setNewPhone] = useState('');
  const [changeToken, setChangeToken] = useState('');
  const [code, setCode] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const reset = () => {
    setStage('idle'); setNewPhone(''); setChangeToken(''); setCode('');
    setCloudPassword(''); setDevOtp(''); setErr('');
  };

  const requestCode = async () => {
    setBusy(true); setErr(''); setOk('');
    try {
      const { data } = await api.post('/auth/phone/change/request', { newPhone });
      setChangeToken(data?.data?.changeToken ?? '');
      if (data?.data?.devOtp) setDevOtp(data.data.devOtp);
      setStage('code');
    } catch (e: unknown) {
      setErr(errMsg(e, t('settings.sendCodeFailed')));
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true); setErr('');
    try {
      await api.post('/auth/phone/change/confirm', {
        changeToken,
        code,
        ...(hasCloudPwd ? { cloudPassword } : {}),
      });
      setOk(t('settings.phoneChangedTo', { phone: newPhone }));
      reset();
    } catch (e: unknown) {
      setErr(errMsg(e, t('settings.changePhoneFailed')));
    } finally { setBusy(false); }
  };

  // ── Шаг 1: ввод нового номера ──────────────────────────────────────────────
  if (stage === 'phone') {
    return (
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">{t('settings.newPhoneTitle')}</h4>
        <p className="text-xs text-content/50">{t('settings.newPhoneHint')}</p>
        <input
          type="tel"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          placeholder="+7 999 123-45-67"
          autoComplete="tel"
          className="input-base w-full"
        />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="flex gap-2">
          <motion.button onClick={reset} whileTap={tap} transition={SPRING.snappy} className="btn-secondary flex-1">
            {t('common.cancel')}
          </motion.button>
          <motion.button
            onClick={requestCode}
            disabled={busy || newPhone.replace(/\D/g, '').length < 10}
            whileTap={tap}
            transition={SPRING.snappy}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('settings.sendCodeBtn')}
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Шаг 2: код (+ облачный пароль) ─────────────────────────────────────────
  if (stage === 'code') {
    return (
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">{t('settings.confirmPhoneTitle')}</h4>
        <p className="text-xs text-content/50">{t('settings.enterCodeSentTo', { phone: newPhone })}</p>
        {devOtp && <p className="text-xs text-amber-400">dev: {devOtp}</p>}
        <input
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder={t('settings.codePlaceholder')}
          autoComplete="one-time-code"
          className="input-base w-full"
        />
        {hasCloudPwd && (
          <input
            type="password"
            value={cloudPassword}
            onChange={(e) => setCloudPassword(e.target.value)}
            placeholder={t('settings.cloudPwdPlaceholder')}
            autoComplete="current-password"
            className="input-base w-full"
          />
        )}
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="flex gap-2">
          <motion.button onClick={reset} whileTap={tap} transition={SPRING.snappy} className="btn-secondary flex-1">
            {t('common.cancel')}
          </motion.button>
          <motion.button
            onClick={confirm}
            disabled={busy || code.length < 4 || (hasCloudPwd && !cloudPassword)}
            whileTap={tap}
            transition={SPRING.snappy}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('settings.changePhone')}
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Главный экран ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-content/40"><Phone size={22} /></div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm">{t('settings.phoneSection')}</h4>
          <p className="text-xs text-content/50 mt-0.5">
            {hasCloudPwd ? t('settings.phoneHintBoth') : t('settings.phoneHintCode')}
          </p>
        </div>
      </div>
      <motion.button
        onClick={() => { setOk(''); setStage('phone'); }}
        whileTap={tap}
        transition={SPRING.snappy}
        className="btn-primary w-full"
      >
        {t('settings.changePhone')}
      </motion.button>
      {ok && <p className="text-green-400 text-sm">{ok}</p>}
    </div>
  );
}

// ─── Recovery codes display ──────────────────────────────────────────────────

function RecoveryCodesView({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyAll = () => {
    copySensitive(codes.join('\n')).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <ShieldCheck size={16} className="text-green-400" />
          {t('settings.twoFaOnTitle')}
        </h4>
        <p className="text-xs text-content/60 mt-2">
          <strong className="text-red-400">{t('settings.recoveryWarn')}</strong>{t('settings.recoveryHint')}
        </p>
      </div>

      <div className="bg-dark-bg border border-dark-border rounded-2xl p-4 grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => <div key={c} className="text-content/85">{c}</div>)}
      </div>

      <div className="flex gap-2">
        <motion.button
          onClick={copyAll}
          whileTap={tap}
          transition={SPRING.snappy}
          className="btn-secondary flex-1"
        >
          {copied ? <><Check size={14} /> {t('settings.copied')}</> : <><Copy size={14} /> {t('settings.copyAll')}</>}
        </motion.button>
        <motion.button
          onClick={onDone}
          whileTap={tap}
          transition={SPRING.snappy}
          className="btn-primary flex-1"
        >
          {t('settings.savedIt')}
        </motion.button>
      </div>
    </div>
  );
}
