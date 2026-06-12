import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, X } from 'lucide-react';

interface Props {
  onPick: (date: Date) => void;
  onClose: () => void;
}

/** Date → значение для input[type=datetime-local] в локальном времени (YYYY-MM-DDTHH:MM) */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ScheduleSendSheet({ onPick, onClose }: Props) {
  const [value, setValue] = useState('');

  // min для инпута: сейчас + 5 минут (фиксируем на маунте)
  const minValue = useMemo(() => toLocalInputValue(new Date(Date.now() + 5 * 60_000)), []);

  const now = new Date();
  // «Сегодня в 20:00» скрываем, если уже позже 19:30
  const showToday20 =
    now.getHours() < 19 || (now.getHours() === 19 && now.getMinutes() < 30);

  const presets: { label: string; date: () => Date }[] = [
    { label: 'Через час', date: () => new Date(Date.now() + 60 * 60_000) },
    ...(showToday20
      ? [{
          label: 'Сегодня в 20:00',
          date: () => {
            const d = new Date();
            d.setHours(20, 0, 0, 0);
            return d;
          },
        }]
      : []),
    {
      label: 'Завтра в 09:00',
      date: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
  ];

  const picked = value ? new Date(value) : null;
  const pickedValid = !!picked && !Number.isNaN(picked.getTime());
  const inPast = pickedValid && picked!.getTime() <= Date.now();
  const canSchedule = pickedValid && !inPast;

  const schedule = () => {
    if (!canSchedule || !picked) return;
    onPick(picked);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-sheet flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-sheet max-w-sm w-[calc(100vw-2rem)] rounded-xl bg-dark-card border border-dark-border shadow-e3 p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-[15px]">Отправить позже</h4>
          <button onClick={onClose} className="btn-icon btn-icon-sm" aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>

        {/* Пресеты */}
        <div className="flex flex-col gap-0.5">
          {presets.map((p) => (
            <button key={p.label} onClick={() => onPick(p.date())} className="menu-item">
              <Clock size={16} className="text-content/45" />
              {p.label}
            </button>
          ))}
        </div>

        <div className="h-px bg-dark-border my-4" />

        {/* Произвольная дата */}
        <input
          type="datetime-local"
          className="input-base w-full"
          min={minValue}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {inPast && (
          <p className="text-rose-400 text-[13px] mt-2">
            Выберите время позже текущего момента
          </p>
        )}
        <button
          onClick={schedule}
          disabled={!canSchedule}
          className="btn-primary btn-block mt-4"
        >
          Запланировать
        </button>
      </motion.div>
    </motion.div>
  );
}
