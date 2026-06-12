/**
 * GroupCallPill — компактный индикатор активного группового звонка.
 *
 * Виден ТОЛЬКО когда есть активный LiveKit-звонок (useCallStore.group). По клику
 * разворачивает свёрнутый GroupCallView. Размещается в Sidebar над списком чатов,
 * чтобы пользователь мог свернуть звонок и продолжать переписку, но всегда
 * видел "вы в звонке".
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, PhoneOff } from 'lucide-react';
import { useCallStore } from '@/stores/call.store';
import { SPRING, tap } from '@/lib/motion';

export default function GroupCallPill() {
  const group              = useCallStore((s) => s.group);
  const setGroupMinimized  = useCallStore((s) => s.setGroupMinimized);
  const clearGroupCall     = useCallStore((s) => s.clearGroupCall);

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!group) { setElapsed(0); return; }
    const startedAt = group.startedAt.getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [group?.chatId]);

  if (!group) return null;

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleExpand = () => setGroupMinimized(false);
  const handleEnd = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearGroupCall();
  };

  // Используем обёртку <div> вместо вложенных <button>. Левая зона раскрывает звонок,
  // правая (PhoneOff) завершает — обе нативные <button> с hit-target ≥ 44px.
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={SPRING.smooth}
      className="mx-4 my-2"
    >
      <div className="flex items-stretch h-12 rounded-xl bg-primary-500/12 border border-primary-500/40 hover:border-primary-500/55 overflow-hidden transition-colors shadow-e1">
        <button
          onClick={handleExpand}
          className="flex-1 min-w-0 flex items-center gap-3 px-3 hover:bg-primary-500/[0.08] transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/40"
          aria-label="Развернуть групповой звонок"
        >
          <span className="relative w-8 h-8 rounded-lg bg-primary-500/30 flex items-center justify-center flex-shrink-0">
            <span className="absolute inset-0 rounded-lg animate-pulse-glow" />
            <Users size={15} className="text-primary-100 relative" />
          </span>
          <span className="flex-1 min-w-0 flex flex-col">
            <span className="text-[13px] font-semibold text-primary-50 truncate leading-tight">В звонке</span>
            <span className="text-[12px] text-primary-500/75 dark:text-primary-200/75 truncate mt-0.5 leading-tight tabular-nums">
              {group.chatName} · {fmt(elapsed)}
            </span>
          </span>
        </button>
        <motion.button
          onClick={handleEnd}
          whileTap={tap} transition={SPRING.snappy}
          className="w-12 flex items-center justify-center bg-red-500/15 hover:bg-red-500/25 text-red-300 hover:text-red-200 border-l border-primary-500/30 transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
          title="Завершить звонок"
          aria-label="Завершить звонок"
        >
          <PhoneOff size={16} />
        </motion.button>
      </div>
    </motion.div>
  );
}
