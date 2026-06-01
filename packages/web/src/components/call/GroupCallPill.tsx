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

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="mx-3 mt-1 mb-2"
    >
      <button
        onClick={handleExpand}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary-500/10 hover:bg-primary-500/15 border border-primary-500/40 hover:border-primary-500/60 transition-all group"
      >
        <span className="w-7 h-7 rounded-full bg-primary-500/30 flex items-center justify-center flex-shrink-0">
          <Users size={14} className="text-primary-200" />
        </span>
        <span className="flex-1 min-w-0 text-left">
          <span className="block text-xs font-semibold text-primary-100 truncate leading-tight">
            В звонке
          </span>
          <span className="block text-[11px] text-primary-200/70 truncate mt-0.5">
            {group.chatName} · {fmt(elapsed)}
          </span>
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={handleEnd}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleEnd(e as any); }}
          className="w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white flex-shrink-0 transition-colors cursor-pointer"
          title="Завершить звонок"
        >
          <PhoneOff size={13} />
        </span>
      </button>
    </motion.div>
  );
}
