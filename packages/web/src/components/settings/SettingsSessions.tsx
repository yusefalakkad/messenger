import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Monitor, Smartphone, X } from 'lucide-react';
import type { UserSession } from '@messenger/shared';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import Dialog, { DialogButton } from '@/components/ui/Dialog';
import { listParent, listChild, tap, SPRING } from '@/lib/motion';

/**
 * Секция «Активные сессии» — список устройств юзера (GET /auth/sessions).
 * Текущее устройство определяется по deviceId из localStorage (тот же ключ,
 * что пишут PhoneAuthForm/LoginForm). Терминация чужой сессии убивает её
 * refresh-токен на бэке — устройство разлогинится при ближайшем refresh.
 */

function getDeviceId(): string {
  try { return localStorage.getItem('deviceId') ?? ''; } catch { return ''; }
}

// Mobile/iPhone/Android в userAgent → телефон, иначе десктоп
function isMobileUA(userAgent?: string | null): boolean {
  return /Mobile|iPhone|Android/i.test(userAgent ?? '');
}

function formatDate(d: Date | string): string {
  const date = new Date(d);
  return `${date.toLocaleDateString('ru', { day: '2-digit', month: 'short' })}, ${date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
}

type Confirm = { type: 'one'; session: UserSession } | { type: 'all' } | null;

export default function SettingsSessions() {
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/auth/sessions', { params: { deviceId: getDeviceId() } })
      .then(({ data }) => setSessions(data.data ?? []))
      .catch(() => {
        setSessions([]);
        toast.error('Не удалось загрузить сессии');
      });
  }, []);

  const terminateOne = async (s: UserSession) => {
    setBusy(true);
    try {
      await api.delete(`/auth/sessions/${s.id}`);
      setSessions((prev) => (prev ?? []).filter((x) => x.id !== s.id));
      toast.success('Сессия завершена');
    } catch {
      toast.error('Не удалось завершить сессию');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const terminateOthers = async () => {
    setBusy(true);
    try {
      await api.post('/auth/sessions/terminate-others', { deviceId: getDeviceId() });
      setSessions((prev) => (prev ?? []).filter((x) => x.isCurrent));
      toast.success('Остальные сессии завершены');
    } catch {
      toast.error('Не удалось завершить сессии');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const others = (sessions ?? []).filter((s) => !s.isCurrent);

  return (
    <div>
      <div className="mb-3 px-1">
        <span className="text-[12px] uppercase tracking-wider font-semibold text-content/55">Активные сессии</span>
      </div>

      {sessions === null ? (
        // Skeleton-плейсхолдеры вместо спиннера
        <div className="space-y-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="list-row cursor-default">
              <div className="skeleton w-10 h-10 rounded-md flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="skeleton h-3.5 w-32 rounded" />
                <div className="skeleton h-2.5 w-44 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-[13px] text-content/35 px-1 py-3">Нет активных сессий</p>
      ) : (
        <motion.div
          variants={listParent}
          initial="hidden"
          animate="visible"
          className="space-y-1"
        >
          {sessions.map((s) => (
            <motion.div
              key={s.id}
              variants={listChild}
              className="list-row cursor-default"
            >
              <div className="w-10 h-10 rounded-md bg-dark-card border border-dark-border flex items-center justify-center text-content/65 flex-shrink-0">
                {isMobileUA(s.userAgent) ? <Smartphone size={18} /> : <Monitor size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-medium truncate">
                    {s.deviceName || (isMobileUA(s.userAgent) ? 'Телефон' : 'Компьютер')}
                  </span>
                  {s.isCurrent && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-brand-gradient text-white font-medium flex-shrink-0">
                      Текущая
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-content/40 truncate tabular-nums">
                  {[s.ipAddress, formatDate(s.createdAt)].filter(Boolean).join(' · ')}
                </div>
              </div>
              {!s.isCurrent && (
                <motion.button
                  className="btn-icon btn-icon-danger flex-shrink-0"
                  whileTap={tap}
                  whileHover={{ scale: 1.04 }}
                  transition={SPRING.snappy}
                  onClick={() => setConfirm({ type: 'one', session: s })}
                  aria-label="Завершить сессию"
                >
                  <X size={16} />
                </motion.button>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      {others.length > 0 && (
        <motion.button
          className="btn-danger btn-sm w-full mt-3"
          whileTap={tap}
          transition={SPRING.snappy}
          onClick={() => setConfirm({ type: 'all' })}
        >
          Завершить все остальные
        </motion.button>
      )}

      {/* Подтверждение терминации */}
      <Dialog
        open={confirm !== null}
        onClose={() => { if (!busy) setConfirm(null); }}
        title={confirm?.type === 'all' ? 'Завершить все остальные сессии?' : 'Завершить сессию?'}
        description={
          confirm?.type === 'all'
            ? 'Все устройства, кроме текущего, будут разлогинены.'
            : confirm?.type === 'one'
              ? `Устройство «${confirm.session.deviceName || 'Без имени'}» будет разлогинено.`
              : undefined
        }
        footer={
          <>
            <DialogButton variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
              Отмена
            </DialogButton>
            <DialogButton
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (confirm?.type === 'one') terminateOne(confirm.session);
                else if (confirm?.type === 'all') terminateOthers();
              }}
            >
              Завершить
            </DialogButton>
          </>
        }
      />
    </div>
  );
}
