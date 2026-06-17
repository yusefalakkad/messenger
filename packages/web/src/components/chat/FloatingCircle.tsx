/**
 * Плавающий кружок-PiP (Telegram-style).
 *
 * Монтируется на уровне страницы и через portal висит поверх всего. Показывается,
 * когда в useCirclePlayer кружок «уехал» из пузыря (floating=true) — например, ты
 * проскроллил его из вида или ушёл в другой чат. Продолжает играть с того же места.
 *
 * Можно перетащить мышью/пальцем. Клик — переход к сообщению (там пузырь снова
 * становится виден → IntersectionObserver возвращает воспроизведение в него).
 * Крестик — полная остановка.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Play, Pause } from 'lucide-react';
import { useCirclePlayer } from '@/stores/circlePlayer.store';
import { usePlaybackStore } from '@/stores/playback.store';
import { useChatStore } from '@/stores/chat.store';

export default function FloatingCircle() {
  const item     = useCirclePlayer((s) => s.item);
  const floating = useCirclePlayer((s) => s.floating);
  const report   = useCirclePlayer((s) => s.report);
  const stop     = useCirclePlayer((s) => s.stop);
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef   = useRef(0);
  const dragRef  = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null);
  const movedRef = useRef(false);

  const [pos, setPos]           = useState({ x: 0, y: 0 }); // смещение от угла
  const [progress, setProgress] = useState(0);
  const [paused, setPaused]     = useState(false);

  const show = !!item && floating;
  const SIZE = 104, STROKE = 4;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;

  // Сброс позиции при смене кружка: иначе новый PiP появится со смещением от
  // перетаскивания предыдущего (вплоть до за-экраном). Компонент смонтирован
  // постоянно, поэтому pos нужно сбрасывать вручную по messageId.
  useEffect(() => { setPos({ x: 0, y: 0 }); movedRef.current = false; }, [item?.messageId]);

  // Старт/синхронизация при появлении — продолжаем с сохранённого времени.
  useEffect(() => {
    if (!show) return;
    const v = videoRef.current;
    if (!v) return;
    const onReady = () => {
      const st = useCirclePlayer.getState();
      try { v.currentTime = st.time; } catch { /* not seekable yet */ }
      if (st.playing) {
        usePlaybackStore.getState().pause(); // «один звук за раз»
        v.play().then(() => setPaused(false)).catch(() => {});
      }
    };
    if (v.readyState >= 1) onReady();
    else v.addEventListener('loadedmetadata', onReady, { once: true });
    return () => v.removeEventListener('loadedmetadata', onReady);
  }, [show, item?.messageId]);

  // Репорт времени обратно в стор (чтобы пузырь продолжил с того же места).
  useEffect(() => {
    if (!show) return;
    const tick = () => {
      const v = videoRef.current;
      if (v && item) {
        const dur = v.duration && Number.isFinite(v.duration) ? v.duration : item.duration;
        if (dur > 0) setProgress(Math.min(1, v.currentTime / dur));
        report(v.currentTime, dur, !v.paused);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [show, item, report]);

  if (!show || !item) return null;

  const toggle = () => {
    if (movedRef.current) return;
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { usePlaybackStore.getState().pause(); v.play().then(() => setPaused(false)).catch(() => {}); }
    else { v.pause(); setPaused(true); }
  };

  const goToMessage = () => {
    if (movedRef.current) return;
    // jumpRequest персистит в сторе до consumeJump → MessageList подхватит его
    // при монтировании целевого чата, без гонки с setTimeout.
    useChatStore.getState().requestJump(item.chatId, item.messageId);
    navigate(`/chat/${item.chatId}`);
  };

  // --- перетаскивание ---
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    movedRef.current = false;
    dragRef.current = { ox: pos.x, oy: pos.y, sx: e.clientX, sy: e.clientY };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true;
    setPos({ x: d.ox + dx, y: d.oy + dy });
  };
  const onUp = () => { dragRef.current = null; };

  return createPortal(
    <div
      className="fixed z-overlay select-none touch-none"
      style={{
        right: '1.5rem',
        bottom: 'calc(var(--sab, 0px) + 5.5rem)',
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        width: SIZE, height: SIZE,
      }}
    >
      <div
        className="relative w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* видео */}
        <div
          className="absolute inset-1 rounded-full overflow-hidden bg-black shadow-e4 ring-1 ring-white/10 cursor-pointer"
          onClick={goToMessage}
        >
          <video
            ref={videoRef}
            src={item.url}
            playsInline
            preload="auto"
            className="w-full h-full object-cover"
            onEnded={stop}
            onClick={(e) => { e.stopPropagation(); toggle(); }}
          />
          {paused && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/35 pointer-events-none">
              <Play size={20} className="text-white ml-0.5" fill="white" />
            </div>
          )}
        </div>

        {/* кольцо прогресса */}
        <svg className="absolute inset-0 -rotate-90 pointer-events-none overflow-visible" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={STROKE} />
          <circle
            cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="#a78bfa" strokeWidth={STROKE}
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 0.1s linear' }}
          />
        </svg>

        {/* крестик — стоп */}
        <button
          onClick={stop}
          aria-label="Закрыть"
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-dark-card border border-dark-border text-content/70 hover:text-content flex items-center justify-center shadow-e2"
        >
          <X size={13} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
