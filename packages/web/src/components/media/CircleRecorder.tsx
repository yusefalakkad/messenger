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

  // Инициализация камеры
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 400, height: 400, facingMode: 'user' }, audio: true })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
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
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center gap-6"
    >
      {/* Круговой превью */}
      <div className="relative" style={{ width: 260, height: 260 }}>
        {/* Прогресс-кольцо */}
        <svg
          className="absolute inset-0 -rotate-90"
          width="260" height="260"
          viewBox="0 0 260 260"
        >
          <circle cx="130" cy="130" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
          {recording && (
            <circle
              cx="130" cy="130" r={RADIUS}
              fill="none"
              stroke="#ef4444"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE - progress}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          )}
        </svg>

        {/* Видео в круге */}
        <div className="absolute inset-3 rounded-full overflow-hidden bg-dark-bg">
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Таймер */}
        {recording && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
            {fmt(time)}
          </div>
        )}
      </div>

      {/* Скрытый canvas для превью */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Подсказка */}
      <p className="text-white/40 text-sm">
        {!ready
          ? 'Запрашиваем камеру...'
          : recording
          ? 'Нажмите ⏹ для отправки'
          : 'Нажмите ● для записи'}
      </p>

      {/* Управление */}
      <div className="flex items-center gap-8">
        <button
          onClick={onCancel}
          className="w-14 h-14 rounded-full bg-dark-card hover:bg-dark-hover flex items-center justify-center text-white/60 hover:text-white transition-colors"
        >
          <X size={22} />
        </button>

        {/* Кнопка записи */}
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={!ready}
          className="relative w-20 h-20 rounded-full flex items-center justify-center transition-all disabled:opacity-40"
        >
          {recording ? (
            <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-xl shadow-red-500/40">
              <div className="w-7 h-7 rounded-md bg-white" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-xl">
              <div className="w-14 h-14 rounded-full bg-red-500" />
            </div>
          )}
        </button>

        <div className="w-14 h-14" /> {/* Пустое место для симметрии */}
      </div>
    </motion.div>
  );
}
