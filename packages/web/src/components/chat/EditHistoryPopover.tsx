/**
 * Поповер истории редактирования сообщения.
 * Показывает прошлые версии (Message.editHistory) снизу-вверх:
 * свежая правка сверху. Fixed-оверлей, клик снаружи — onClose.
 */
import { motion } from 'framer-motion';
import { History, X } from 'lucide-react';

interface Props {
  history: { content: string; editedAt: string }[];
  onClose: () => void;
}

// Время версии: сегодня — HH:MM, иначе «12 июн., HH:MM»
function formatVersionTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  const isToday = d.toDateString() === new Date().toDateString();
  if (isToday) return time;
  return `${d.toLocaleDateString('ru', { day: '2-digit', month: 'short' })}, ${time}`;
}

export default function EditHistoryPopover({ history, onClose }: Props) {
  // Снизу-вверх: последняя правка первой
  const versions = [...history].reverse();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-overlay flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-modal max-w-xs w-[calc(100vw-2rem)] rounded-xl bg-dark-card border border-dark-border shadow-e3 p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2 font-semibold text-[13px]">
            <History size={16} className="text-content/45" />
            История изменений
          </span>
          <button onClick={onClose} className="btn-icon btn-icon-sm" aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>

        {versions.length === 0 ? (
          <p className="text-[13px] text-content/45">Прошлых версий нет</p>
        ) : (
          <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1">
            {versions.map((v, i) => (
              <div key={`${v.editedAt}-${i}`} className="flex flex-col gap-0.5">
                <span className="text-[11px] leading-4 text-content/45 tabular-nums">
                  {formatVersionTime(v.editedAt)}
                </span>
                <p className="text-[13px] leading-5 text-content/80 whitespace-pre-wrap break-words">
                  {v.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
