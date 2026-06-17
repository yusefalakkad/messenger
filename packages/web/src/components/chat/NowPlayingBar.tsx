/**
 * Верхняя плашка «сейчас играет» (Telegram-style).
 *
 * Показывается, пока в глобальном сторе (usePlaybackStore) есть активное
 * голосовое. Живёт на уровне страницы (вне роут-анимации), поэтому виден и
 * когда ты в ДРУГОМ чате. Контролы: play/pause, скорость, крестик (стоп).
 * Клик по плашке — переход к сообщению в его чате.
 */
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, X, AudioLines } from 'lucide-react';
import { usePlaybackStore } from '@/stores/playback.store';
import { useChatStore } from '@/stores/chat.store';

export default function NowPlayingBar() {
  const navigate = useNavigate();

  const current     = usePlaybackStore((s) => s.current);
  const playing     = usePlaybackStore((s) => s.playing);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const duration    = usePlaybackStore((s) => s.duration);
  const rate        = usePlaybackStore((s) => s.rate);
  const toggle      = usePlaybackStore((s) => s.toggle);
  const setRate     = usePlaybackStore((s) => s.setRate);
  const stop        = usePlaybackStore((s) => s.stop);

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const jump = () => {
    if (!current) return;
    // requestJump кладёт запрос в стор; он персистит до consumeJump, поэтому
    // MessageList целевого чата подхватит его при монтировании/загрузке items —
    // без гонки с фиксированным setTimeout.
    useChatStore.getState().requestJump(current.chatId, current.messageId);
    navigate(`/chat/${current.chatId}`);
  };

  const cycleRate = () => {
    const order = [1, 1.5, 2];
    const next = order[(order.indexOf(rate) + 1 + order.length) % order.length] ?? 1;
    setRate(next);
  };

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          className="relative z-raised flex-shrink-0 overflow-hidden border-b border-dark-border bg-dark-surface/85 backdrop-blur-xl"
        >
          <div className="flex items-center gap-2 px-3 h-12">
            {/* play/pause */}
            <button
              onClick={toggle}
              aria-label={playing ? 'Пауза' : 'Воспроизвести'}
              className="w-9 h-9 rounded-full bg-primary-600 hover:bg-primary-500 flex items-center justify-center flex-shrink-0 transition-colors"
            >
              {playing
                ? <Pause size={15} fill="currentColor" className="text-white" />
                : <Play  size={15} fill="currentColor" className="text-white ml-0.5" />}
            </button>

            {/* инфо — кликом прыгаем к сообщению */}
            <button onClick={jump} className="flex items-center gap-2 flex-1 min-w-0 text-left group">
              <AudioLines size={16} className="text-primary-500 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-content/90 truncate group-hover:text-content">
                  {current.senderName}
                </div>
                <div className="text-[11px] text-content/45 tabular-nums leading-tight">
                  {fmt(currentTime)} / {fmt(duration)}
                </div>
              </div>
            </button>

            {/* скорость */}
            <button
              onClick={cycleRate}
              aria-label="Скорость воспроизведения"
              className="h-7 px-2 rounded-full bg-content/10 hover:bg-content/20 text-content/70 text-[11px] font-medium tabular-nums transition-colors flex-shrink-0"
            >
              {rate}x
            </button>

            {/* стоп / закрыть */}
            <button
              onClick={stop}
              aria-label="Остановить"
              className="w-8 h-8 rounded-full hover:bg-content/10 text-content/55 hover:text-content flex items-center justify-center flex-shrink-0 transition-colors"
            >
              <X size={17} />
            </button>
          </div>

          {/* тонкая линия прогресса */}
          <div className="absolute bottom-0 inset-x-0 h-[2px] bg-content/10">
            <div
              className="h-full bg-primary-500"
              style={{ width: `${progress * 100}%`, transition: 'width 0.1s linear' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function fmt(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
