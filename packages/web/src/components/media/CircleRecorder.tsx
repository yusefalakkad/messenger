/**
 * Видео-кружок — записывает круглое видео до 60 секунд.
 * Показывает живой превью в круге с прогресс-кольцом.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Send } from 'lucide-react';

interface Props {
  onRecorded: (blob: Blob, duration: number, thumbnailUrl: string) => void;
  onCancel: () => void;
}

const MAX_DURATION = 60;
const RADIUS = 108;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function CircleRecorder({ onRecorded, onCancel }: Props) {
  const videoRef         = useRef<HTMLVideoElement>(null);
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const recorderRef      = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<BlobPart[]>([]);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRecordingRef = useRef<() => void>(() => {});

  const [ready, setReady]       = useState(false);
  const [recording, setRecording] = useState(false);
  const [time, setTime]         = useState(0);

  const progress = (time / MAX_DURATION) * CIRCUMFERENCE;

  // Инициализация камеры — повышаем разрешение, добавляем aspectRatio чтобы лицо не растягивалось
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { width: 480, height: 480, aspectRatio: 1, facingMode: 'user' },
        audio: true,
      })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { /* iOS autoplay quirks — ok */ });
        }
        setReady(true);
      })
      .catch(() => onCancel());

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Захват стоп-кадра для превью
  const captureThumb = useCallback((): string => {
    const canvas = canvasRef.current!;
    const video  = videoRef.current!;
    canvas.width  = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -400, 0, 400, 400);
    ctx.restore();
    return canvas.toDataURL('image/jpeg', 0.7);
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current || recording) return;
    chunksRef.current = [];
    const mimeType = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm',
      'video/mp4',
    ].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    const mr = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    recorderRef.current = mr;
    mr.start(100);
    setRecording(true);

    timerRef.current = setInterval(() => {
      setTime((t) => {
        if (t + 1 >= MAX_DURATION) { stopRecordingRef.current(); return MAX_DURATION; }
        return t + 1;
      });
    }, 1000);
  }, [recording]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    clearInterval(timerRef.current!);

    const thumb = captureThumb();
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' });
      onRecorded(blob, time, thumb);
    };
    rec.stop();
    setRecording(false);
  }, [time, captureThumb, onRecorded]);

  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center gap-8 px-6"
    >
      {/* Кнопка закрытия — в углу, не теснит запись */}
      <button
        onClick={onCancel}
        aria-label="Отменить"
        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/70 hover:text-white transition-colors"
      >
        <X size={20} />
      </button>

      {/* Круговой превью */}
      <div className="relative" style={{ width: 280, height: 280 }}>
        {/* Прогресс-кольцо */}
        <svg
          className="absolute inset-0 -rotate-90 pointer-events-none"
          width="280" height="280"
          viewBox="0 0 280 280"
        >
          <circle cx="140" cy="140" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
          {recording && (
            <circle
              cx="140" cy="140" r={RADIUS}
              fill="none"
              stroke="#ef4444"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE - progress}
              style={{ transition: 'stroke-dashoffset 1s linear', filter: 'drop-shadow(0 0 8px rgba(239,68,68,0.6))' }}
            />
          )}
        </svg>

        {/* Видео в круге */}
        <div className="absolute inset-3 rounded-full overflow-hidden bg-dark-bg ring-1 ring-white/10">
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-dark-bg/60">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
          {/* Pulse-индикатор записи */}
          {recording && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] text-white font-medium tabular-nums">REC</span>
            </div>
          )}
        </div>
      </div>

      {/* Скрытый canvas для превью */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Таймер + подсказка над кнопкой */}
      <div className="flex flex-col items-center gap-2">
        <div className={
          recording
            ? 'text-2xl font-bold text-white tabular-nums'
            : 'text-2xl font-bold text-white/40 tabular-nums'
        }>
          {fmt(time)} <span className="text-sm text-white/35 font-normal">/ {fmt(MAX_DURATION)}</span>
        </div>
        <p className="text-white/70 text-sm">
          {!ready
            ? 'Запрашиваем камеру...'
            : recording
            ? 'Идёт запись. Нажмите ⏹ чтобы отправить'
            : 'Нажмите ● чтобы начать запись'}
        </p>
      </div>

      {/* Управление — большая центральная кнопка, без пустых блоков */}
      <div className="flex items-center justify-center">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={!ready}
          aria-label={recording ? 'Остановить и отправить' : 'Начать запись'}
          className="relative w-24 h-24 rounded-full flex items-center justify-center transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {recording ? (
            <div className="w-24 h-24 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-2xl shadow-red-500/50 ring-4 ring-red-500/20">
              <Send size={28} className="text-white -translate-x-0.5" />
            </div>
          ) : (
            <div className="w-24 h-24 rounded-full bg-white hover:bg-white/95 flex items-center justify-center shadow-2xl ring-4 ring-white/10">
              <div className="w-16 h-16 rounded-full bg-red-500" />
            </div>
          )}
        </button>
      </div>
    </motion.div>
  );
}
