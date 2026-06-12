/**
 * Полноэкранный рекордер видео-сообщения (прямоугольное видео).
 * • Использует getUserMedia({ video, audio })
 * • Записывает через MediaRecorder, формат webm (vp8/vp9/opus)
 * • Жёсткий лимит длительности — 60 секунд
 * • После остановки сразу возвращает blob + длительность + кадр-обложку
 *
 * НЕ заменяет CircleRecorder — это отдельный экран для полноразмерного видео.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Square, RotateCw, Send, Video as VideoIcon } from 'lucide-react';
import { SPRING, tap } from '@/lib/motion';

interface Props {
  /** Колбэк после остановки записи. */
  onRecorded: (blob: Blob, duration: number, thumbDataUrl: string) => void;
  onCancel: () => void;
}

const MAX_DURATION = 60;

export default function VideoRecorder({ onRecorded, onCancel }: Props) {
  const videoRef         = useRef<HTMLVideoElement>(null);
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const recorderRef      = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<BlobPart[]>([]);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef          = useRef<() => void>(() => {});

  const [ready,     setReady]     = useState(false);
  const [recording, setRecording] = useState(false);
  const [time,      setTime]      = useState(0);
  const [facingUser, setFacingUser] = useState(true);
  const [err,        setErr]        = useState<string | null>(null);

  // ─── Инициализация камеры ────────────────────────────────────────────────
  const initCamera = useCallback(async (front: boolean) => {
    // Останавливаем предыдущий поток, если был
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: front ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
    } catch (e) {
      console.error('Camera init failed', e);
      setErr('Не удалось получить доступ к камере');
    }
  }, []);

  useEffect(() => {
    initCamera(true);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Захват стоп-кадра (poster) ──────────────────────────────────────────
  const captureThumb = useCallback((): string => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return '';
    const w = video.videoWidth  || 720;
    const h = video.videoHeight || 1280;
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    if (facingUser) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -w, 0, w, h); ctx.restore(); }
    else            { ctx.drawImage(video, 0, 0, w, h); }
    return canvas.toDataURL('image/jpeg', 0.75);
  }, [facingUser]);

  // ─── Запись ──────────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!streamRef.current || recording) return;
    chunksRef.current = [];
    const mime = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    const mr = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorderRef.current = mr;
    mr.start(100);
    setRecording(true);
    setTime(0);

    timerRef.current = setInterval(() => {
      setTime((t) => {
        if (t + 1 >= MAX_DURATION) { stopRef.current(); return MAX_DURATION; }
        return t + 1;
      });
    }, 1000);
  }, [recording]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    const thumb = captureThumb();
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' });
      // Останавливаем камеру — она нам больше не нужна
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      onRecorded(blob, time, thumb);
    };
    rec.stop();
    setRecording(false);
  }, [captureThumb, onRecorded, time]);

  useEffect(() => { stopRef.current = stopRecording; }, [stopRecording]);

  // ─── UI helpers ──────────────────────────────────────────────────────────
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const progress = (time / MAX_DURATION) * 100;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-overlay bg-black flex flex-col"
    >
      {/* Верхняя панель */}
      <div
        className="flex items-center justify-between px-4 pt-4 pb-2 z-raised"
        style={{ paddingTop: 'calc(var(--sat, 0px) + 1rem)' }}
      >
        <motion.button
          onClick={() => {
            streamRef.current?.getTracks().forEach((t) => t.stop());
            onCancel();
          }}
          whileHover={{ scale: 1.06 }}
          whileTap={tap}
          transition={SPRING.snappy}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-md"
          aria-label="Закрыть"
        >
          <X size={18} />
        </motion.button>

        {recording && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5"
          >
            <motion.span
              className="w-2 h-2 rounded-full bg-red-500"
              animate={{ opacity: [1, 0.3, 1], scale: [1, 0.85, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span className="text-white text-sm font-medium tabular-nums">{fmt(time)} / 1:00</span>
          </motion.div>
        )}

        <motion.button
          onClick={() => { setFacingUser((f) => { initCamera(!f); return !f; }); }}
          disabled={recording}
          whileHover={recording ? undefined : { scale: 1.06 }}
          whileTap={recording ? undefined : tap}
          transition={SPRING.snappy}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-md disabled:opacity-40"
          aria-label="Переключить камеру"
        >
          <RotateCw size={18} />
        </motion.button>
      </div>

      {/* Превью камеры — занимает основное пространство */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: facingUser ? 'scaleX(-1)' : undefined }}
        />
        {!ready && !err && (
          <div className="z-10 flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-white/60 text-sm">Запрашиваем камеру...</p>
          </div>
        )}
        {err && (
          <div className="z-10 flex flex-col items-center gap-3 px-6 text-center">
            <VideoIcon size={36} className="text-red-400" />
            <p className="text-white/80 text-sm">{err}</p>
          </div>
        )}

        {/* Прогресс-бар на верхней границе превью */}
        {recording && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 z-raised">
            <div className="h-full bg-brand-gradient transition-all duration-1000 ease-linear" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Скрытый canvas для poster-кадра */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Подсказка */}
      <p className="text-center text-white/50 text-sm pb-3">
        {!ready
          ? ''
          : recording
            ? 'Нажмите ⏹ для отправки'
            : 'Нажмите ● для записи видео'}
      </p>

      {/* Нижняя панель управления */}
      <div
        className="flex items-center justify-center gap-10 pb-10 pt-2"
        style={{ paddingBottom: 'calc(var(--sab, 0px) + 2.5rem)' }}
      >
        <div className="w-14 h-14" />

        {!recording ? (
          <motion.button
            onClick={startRecording}
            disabled={!ready}
            whileHover={ready ? { scale: 1.05 } : undefined}
            whileTap={ready ? tap : undefined}
            transition={SPRING.snappy}
            className="w-20 h-20 rounded-full bg-white/90 hover:bg-white shadow-e3 ring-4 ring-white/10 flex items-center justify-center disabled:opacity-40"
            aria-label="Начать запись"
          >
            <div className="w-14 h-14 rounded-full bg-red-500 shadow-[0_0_22px_-4px_rgba(239,68,68,0.7)]" />
          </motion.button>
        ) : (
          <motion.button
            onClick={stopRecording}
            whileTap={tap}
            transition={SPRING.snappy}
            className="relative w-20 h-20 rounded-full bg-red-500 hover:bg-red-400 shadow-e3 shadow-red-500/40 flex items-center justify-center"
            aria-label="Остановить и отправить"
          >
            <motion.span
              className="absolute inset-0 rounded-full ring-4 ring-red-500/40"
              animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            />
            <Square size={26} fill="white" className="text-white" />
          </motion.button>
        )}

        {recording ? (
          <motion.button
            onClick={stopRecording}
            whileHover={{ scale: 1.06 }}
            whileTap={tap}
            transition={SPRING.snappy}
            className="w-14 h-14 rounded-full bg-brand-gradient text-white shadow-glow-violet flex items-center justify-center"
            aria-label="Отправить"
          >
            <Send size={20} />
          </motion.button>
        ) : (
          <div className="w-14 h-14" />
        )}
      </div>
    </motion.div>
  );
}
