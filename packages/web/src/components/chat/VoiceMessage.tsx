/**
 * Голосовое сообщение — контроллер ГЛОБАЛЬНОГО плеера (usePlaybackStore).
 * Своего <audio> не держит: воспроизведение живёт в сторе и продолжается даже
 * при переходе в другой чат (там его показывает верхняя плашка NowPlayingBar).
 * Здесь — кнопка play/pause, waveform с перемоткой, скорость, время.
 */
import { useRef } from 'react';
import { clsx } from 'clsx';
import { Play, Pause } from 'lucide-react';
import type { Message } from '@messenger/shared';
import { usePlaybackStore, RATES } from '@/stores/playback.store';

export default function VoiceMessage({
  media, isOwn, messageId, chatId, senderName,
}: {
  media: NonNullable<Message['media']>;
  isOwn: boolean;
  messageId: string;
  chatId: string;
  senderName: string;
}) {
  const waveRef     = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const isActive    = usePlaybackStore((s) => s.current?.messageId === messageId);
  const playing     = usePlaybackStore((s) => s.playing && s.current?.messageId === messageId);
  const storeTime   = usePlaybackStore((s) => s.currentTime);
  const storeDur    = usePlaybackStore((s) => s.duration);
  const rate        = usePlaybackStore((s) => s.rate);
  const play        = usePlaybackStore((s) => s.play);
  const toggle      = usePlaybackStore((s) => s.toggle);
  const seekRatio   = usePlaybackStore((s) => s.seekRatio);
  const setRate     = usePlaybackStore((s) => s.setRate);

  // Длительность: у активного берём из стора (точная), иначе из media.
  const duration = isActive && storeDur > 0 ? storeDur : (media.duration ?? 0);
  const current  = isActive ? storeTime : 0;
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  const item = () => ({
    messageId, chatId, url: media.url, senderName, duration: media.duration ?? 0,
  });

  const handlePlay = () => {
    if (isActive) toggle();
    else play(item());
  };

  const cycleRate = () => {
    const idx  = RATES.indexOf(rate as typeof RATES[number]);
    const next = RATES[(idx + 1 + RATES.length) % RATES.length];
    setRate(next);
  };

  // --- Перемотка по waveform (только когда трек активен) ---
  const ratioFromEvent = (e: React.PointerEvent) => {
    const el = waveRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation(); // не дёргать swipe-to-reply пузыря
    if (!isActive) { play(item()); return; } // не активен → просто запускаем
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    seekRatio(ratioFromEvent(e));
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    seekRatio(ratioFromEvent(e));
  };
  const endDrag = (e: React.PointerEvent, seek: boolean) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (seek) seekRatio(ratioFromEvent(e));
  };

  const bars = media.waveform
    ?? Array.from({ length: 40 }, (_, i) => 0.3 + 0.5 * Math.sin(i * 0.4));
  const filledCount = Math.round(progress * bars.length);

  return (
    <div className="flex items-center gap-3 py-1 min-w-[200px] pr-2">
      {/* Кнопка play/pause */}
      <button
        onClick={handlePlay}
        className={clsx(
          'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
          isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-primary-600 hover:bg-primary-500',
        )}
      >
        {playing
          ? <Pause size={15} fill="currentColor" className="text-white" />
          : <Play  size={15} fill="currentColor" className="text-white ml-0.5" />
        }
      </button>

      {/* Waveform с прогрессом и перемоткой */}
      <div
        ref={waveRef}
        className="flex items-center gap-[2px] flex-1 h-9 cursor-pointer touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => endDrag(e, true)}
        onPointerCancel={(e) => endDrag(e, false)}
      >
        {bars.map((h: number, i: number) => (
          <div
            key={i}
            className={clsx(
              'flex-1 rounded-full pointer-events-none transition-colors duration-75',
              i < filledCount
                ? (isOwn ? 'bg-white' : 'bg-primary-400')
                : (isOwn ? 'bg-white/35' : 'bg-content/25'),
            )}
            style={{ height: `${Math.max(3, h * 28)}px` }}
          />
        ))}
      </div>

      {/* Время: активный → текущее / общее, иначе длительность */}
      <span className={clsx('text-xs flex-shrink-0 tabular-nums', isOwn ? 'text-white/50' : 'text-content/50')}>
        {isActive
          ? `${formatDuration(current)} / ${formatDuration(duration)}`
          : formatDuration(duration)}
      </span>

      {/* Скорость (глобальная) — показываем только у активного, как в Telegram */}
      {isActive && (
        <button
          onClick={cycleRate}
          className={clsx(
            'h-7 px-2 rounded-full flex items-center justify-center flex-shrink-0',
            'text-[11px] font-medium tabular-nums transition-colors',
            isOwn
              ? 'bg-white/15 hover:bg-white/25 text-white/80'
              : 'bg-content/10 hover:bg-content/20 text-content/70',
          )}
        >
          {rate}x
        </button>
      )}
    </div>
  );
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
