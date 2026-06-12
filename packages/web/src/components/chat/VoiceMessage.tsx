/**
 * Голосовое сообщение — play/pause, waveform с перемоткой (клик/драг),
 * скорость 1x/1.5x/2x, текущее время при воспроизведении. Вынесено из MessageBubble.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { Play, Pause } from 'lucide-react';
import type { Message } from '@messenger/shared';

const RATES = [1, 1.5, 2] as const;

export default function VoiceMessage({
  media, isOwn,
}: {
  media: NonNullable<Message['media']>;
  isOwn: boolean;
}) {
  const audioRef    = useRef<HTMLAudioElement>(null);
  const waveRef     = useRef<HTMLDivElement>(null);
  const rafRef      = useRef(0);
  const draggingRef = useRef(false);

  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [current,  setCurrent]  = useState(0); // секунды
  const [rateIdx,  setRateIdx]  = useState(0);
  const [dragging, setDragging] = useState(false);
  const [audioDur, setAudioDur] = useState(0);

  // audio.duration у webm-записей бывает Infinity — фолбэк на media.duration
  const duration = audioDur > 0 ? audioDur : (media.duration ?? 0);

  // Точный прогресс: timeupdate редкий — пока играет, догоняем через rAF
  const syncProgress = useCallback(() => {
    const a = audioRef.current;
    if (!a || draggingRef.current) return;
    setCurrent(a.currentTime);
    if (duration > 0) setProgress(Math.min(1, a.currentTime / duration));
  }, [duration]);

  useEffect(() => {
    if (!playing) return;
    const tick = () => { syncProgress(); rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, syncProgress]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else {
      a.playbackRate = RATES[rateIdx];
      a.play().catch(() => {});
      setPlaying(true);
    }
  }, [playing, rateIdx]);

  const cycleRate = useCallback(() => {
    const next = (rateIdx + 1) % RATES.length;
    setRateIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = RATES[next];
  }, [rateIdx]);

  // --- Перемотка по waveform ---
  const ratioFromEvent = (e: React.PointerEvent) => {
    const el = waveRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation(); // не дёргать swipe-to-reply/long-press пузыря
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    const r = ratioFromEvent(e);
    setProgress(r);
    setCurrent(r * duration);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const r = ratioFromEvent(e);
    setProgress(r);
    setCurrent(r * duration);
  };

  const endDrag = (e: React.PointerEvent, seek: boolean) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    if (!seek) return;
    const r = ratioFromEvent(e);
    const a = audioRef.current;
    if (a && duration > 0) {
      a.currentTime = r * duration;
      setProgress(r);
      setCurrent(r * duration);
    }
  };

  const handleEnded = () => { setPlaying(false); setProgress(0); setCurrent(0); };

  const totalBars = 40;
  const bars = media.waveform
    ?? Array.from({ length: totalBars }, (_, i) => 0.3 + 0.5 * Math.sin(i * 0.4));
  const filledCount = Math.round(progress * bars.length);

  return (
    <div className="flex items-center gap-3 py-1 min-w-[200px] pr-2">
      <audio
        ref={audioRef}
        src={media.url}
        onTimeUpdate={syncProgress}
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          if (d && Number.isFinite(d)) setAudioDur(d);
        }}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* Кнопка play/pause */}
      <button
        onClick={toggle}
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
              'flex-1 rounded-full pointer-events-none',
              !dragging && 'transition-colors duration-75',
              i < filledCount
                ? (isOwn ? 'bg-white' : 'bg-primary-400')
                : (isOwn ? 'bg-white/35' : 'bg-content/25'),
            )}
            style={{ height: `${Math.max(3, h * 28)}px` }}
          />
        ))}
      </div>

      {/* Время: при playing/drag — текущее / общее, иначе длительность */}
      <span className={clsx('text-xs flex-shrink-0 tabular-nums', isOwn ? 'text-white/50' : 'text-content/50')}>
        {playing || dragging
          ? `${formatDuration(current)} / ${formatDuration(duration)}`
          : formatDuration(duration)}
      </span>

      {/* Скорость воспроизведения */}
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
        {RATES[rateIdx]}x
      </button>
    </div>
  );
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
