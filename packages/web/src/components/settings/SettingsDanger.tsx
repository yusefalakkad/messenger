import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import Dialog, { DialogButton } from '@/components/ui/Dialog';
import { tap, SPRING } from '@/lib/motion';

/**
 * Секция «Опасная зона» — удаление аккаунта (DELETE /users/me, soft-delete).
 * Если у юзера установлен облачный пароль (passwordSet) — бэк требует его
 * для подтверждения. Дополнительная защита от misclick — текст «УДАЛИТЬ».
 */

const CONFIRM_WORD = 'УДАЛИТЬ';

export default function SettingsDanger({ passwordSet }: { passwordSet: boolean }) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPassword('');
    setConfirmText('');
    setErr('');
  };

  const canDelete = confirmText.trim() === CONFIRM_WORD && (!passwordSet || password.length > 0);

  const deleteAccount = async () => {
    setBusy(true); setErr('');
    try {
      await api.delete('/users/me', { data: passwordSet ? { password } : {} });
      logout();
      navigate('/auth');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setErr(msg ?? 'Не удалось удалить аккаунт');
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 flex-shrink-0">
          <TriangleAlert size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="mb-0.5">
            <span className="text-[12px] uppercase tracking-wider font-semibold text-content/55">Опасная зона</span>
          </div>
          <p className="text-[12px] text-content/45 leading-snug">Удаление аккаунта необратимо стирает профиль и завершает все сессии.</p>
        </div>
      </div>

      <motion.button
        className="btn-danger btn-sm w-full"
        whileTap={tap}
        transition={SPRING.snappy}
        onClick={() => setOpen(true)}
      >
        <TriangleAlert size={15} />
        Удалить аккаунт
      </motion.button>

      <Dialog
        open={open}
        onClose={close}
        title="Удалить аккаунт?"
        description="Профиль, имя и фото будут стёрты безвозвратно, все сессии завершены. Это действие нельзя отменить."
        footer={
          <>
            <DialogButton variant="secondary" onClick={close} disabled={busy}>
              Отмена
            </DialogButton>
            <DialogButton variant="danger" onClick={deleteAccount} disabled={busy || !canDelete}>
              {busy ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Удалить'}
            </DialogButton>
          </>
        }
      >
        <div className="space-y-3">
          {passwordSet && (
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErr(''); }}
              placeholder="Облачный пароль"
              autoComplete="current-password"
              className="input-base w-full"
            />
          )}
          <div>
            <p className="text-[12px] text-content/40 mb-1.5">
              Введите <span className="font-semibold text-rose-600 dark:text-rose-300">{CONFIRM_WORD}</span> для подтверждения:
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              className="input-base w-full"
            />
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
        </div>
      </Dialog>
    </div>
  );
}
