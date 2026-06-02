import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, ShieldOff, Loader2, Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { copySensitive } from '@/lib/sensitiveClipboard';
import IconBtn from '@/components/ui/IconBtn';

interface Props { open: boolean; onClose: () => void; }

type Status = { enabled: boolean; remainingRecoveryCodes: number } | null;

export default function SettingsDialog({ open, onClose }: Props) {
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!open) return;
    api.get('/auth/2fa/status').then(({ data }) => setStatus(data.data));
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-dark-card border border-dark-border rounded-3xl shadow-2xl shadow-black/60 w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border/60">
              <h3 className="font-semibold text-base">Настройки</h3>
              <IconBtn size="sm" onClick={onClose}><X size={16} /></IconBtn>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <TwoFactorSection status={status} onChange={setStatus} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── 2FA секция ──────────────────────────────────────────────────────────────

function TwoFactorSection({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
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
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Ошибка');
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
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Неверный код');
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
      setErr((e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Ошибка');
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
          <h4 className="font-semibold text-sm mb-1">Шаг 1 — отсканируй QR</h4>
          <p className="text-xs text-white/50">Google Authenticator, Authy, 1Password — любое TOTP-приложение.</p>
        </div>
        <div className="bg-white p-3 rounded-2xl flex items-center justify-center">
          <img src={setup.qr} alt="QR" className="w-48 h-48" />
        </div>
        <div>
          <p className="text-xs text-white/40 mb-1">Или введи секрет вручную:</p>
          <code className="block bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono break-all text-white/80">
            {setup.secret}
          </code>
        </div>

        <div className="border-t border-dark-border/40 pt-4">
          <h4 className="font-semibold text-sm mb-2">Шаг 2 — введи 6-значный код из приложения</h4>
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
          <button
            onClick={() => setSetup(null)}
            className="flex-1 py-2.5 rounded-xl bg-dark-hover hover:bg-dark-border text-sm font-medium"
          >
            Отмена
          </button>
          <button
            onClick={confirmEnable}
            disabled={busy || code.length < 6}
            className="flex-1 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Включить
          </button>
        </div>
      </div>
    );
  }

  // ── Disable-флоу ───────────────────────────────────────────────────────────
  if (showDisable) {
    return (
      <div className="space-y-4">
        <h4 className="font-semibold text-sm">Отключить двухфакторную аутентификацию?</h4>
        <p className="text-xs text-white/50">Подтверди паролем и текущим кодом из приложения.</p>
        <input
          type="password"
          value={disablePwd}
          onChange={(e) => setDisablePwd(e.target.value)}
          placeholder="Пароль"
          className="input-base w-full"
        />
        <input
          value={disableCode}
          onChange={(e) => setDisableCode(e.target.value)}
          placeholder="Код из приложения"
          inputMode="numeric"
          className="input-base w-full text-center tracking-widest font-mono"
        />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="flex gap-2">
          <button onClick={() => setShowDisable(false)} className="flex-1 py-2.5 rounded-xl bg-dark-hover hover:bg-dark-border text-sm font-medium">
            Отмена
          </button>
          <button onClick={disable} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />}
            Отключить
          </button>
        </div>
      </div>
    );
  }

  // ── Главный экран ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${status?.enabled ? 'text-green-400' : 'text-white/40'}`}>
          {status?.enabled ? <ShieldCheck size={22} /> : <ShieldOff size={22} />}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm">Двухфакторная аутентификация</h4>
          <p className="text-xs text-white/50 mt-0.5">
            {status?.enabled
              ? `Включена. Осталось ${status.remainingRecoveryCodes} recovery-кодов.`
              : 'Пароль + одноразовый код из приложения при каждом входе.'}
          </p>
        </div>
      </div>

      {!status?.enabled ? (
        <button
          onClick={startSetup}
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Включить 2FA
        </button>
      ) : (
        <button
          onClick={() => setShowDisable(true)}
          className="w-full py-2.5 rounded-xl bg-dark-hover hover:bg-red-500/20 hover:text-red-400 text-sm font-medium transition-colors"
        >
          Отключить 2FA
        </button>
      )}

      {err && <p className="text-red-400 text-sm">{err}</p>}
    </div>
  );
}

// ─── Recovery codes display ──────────────────────────────────────────────────

function RecoveryCodesView({ codes, onDone }: { codes: string[]; onDone: () => void }) {
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
          2FA включена
        </h4>
        <p className="text-xs text-white/60 mt-2">
          <strong className="text-red-400">Сохрани эти 10 recovery-кодов сейчас.</strong> Каждый можно использовать
          один раз вместо TOTP-кода, если потеряешь телефон. Больше они не покажутся.
        </p>
      </div>

      <div className="bg-dark-bg border border-dark-border rounded-2xl p-4 grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => <div key={c} className="text-white/85">{c}</div>)}
      </div>

      <div className="flex gap-2">
        <button
          onClick={copyAll}
          className="flex-1 py-2.5 rounded-xl bg-dark-hover hover:bg-dark-border text-sm font-medium flex items-center justify-center gap-2"
        >
          {copied ? <><Check size={14} /> Скопировано</> : <><Copy size={14} /> Скопировать все</>}
        </button>
        <button
          onClick={onDone}
          className="flex-1 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium"
        >
          Сохранил
        </button>
      </div>
    </div>
  );
}
