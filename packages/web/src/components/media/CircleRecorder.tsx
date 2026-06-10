/**
 * Видео-кружок — записывает круглое видео до 60 секунд.
 * Показывает живой превью в круге с прогресс-кольцом.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Trash2, Play, Pause, Square } from 'lucide-react';

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
  // Превью отснятого: после stop сохраняем blob+thumb и показываем playback;
  // отправка — отдельным жестом. Можно «перезаписать» сбросив preview.
  const [preview, setPreview]   = useState<{ blob: Blob; url: string; thumb: string; duration: number } | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  const progress = (time / MAX_DURATION) * CIRCUMFERENCE;
  // Предупреждение цветом: за 10 сек до лимита таймер становится оранжевым/красным.
  const nearLimit = recording && time >= MAX_DURATION - 10;

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

  // Захват стоп-кадра для превью.
  // P2-5: НЕ зеркалим thumbnail. Превью в чате показывается БЕЗ scaleX(-1)
  // (video-pause UI рендерит как есть), а сама запись тоже без зеркала.
  // Если зеркалить превью — получаем «прыжок» картинки при play (preview vs video).
  const captureThumb = useCallback((): string => {
    const canvas = canvasRef.current!;
    const video  = videoRef.current!;
    canvas.width  = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, 400, 400);
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

  // Stop recording → переходим в preview-state (НЕ авто-отправка). Юзер сам жмёт Send.
  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    const thumb = captureThumb();
    const finishedDuration = time; // фиксируем — позже time=0 после сброса state
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      setPreview({ blob, url, thumb, duration: Math.max(1, finishedDuration) });
    };
    rec.stop();
    setRecording(false);
  }, [time, captureThumb]);

  // Сбросить отснятое и начать заново.
  const discardPreview = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setPreviewPlaying(false);
    setTime(0);
  }, [preview]);

  // Отправить отснятое.
  const sendPreview = useCallback(() => {
    if (!preview) return;
    onRecorded(preview.blob, preview.duration, preview.thumb);
    URL.revokeObjectURL(preview.url);
  }, [preview, onRecorded]);

  // Отмена recording mid-take — выкидываем chunks без сохранения.
  const cancelRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null; // не вызываем callback
      try { rec.stop(); } catch { /* ignore */ }
    }
    chunksRef.current = [];
    setRecording(false);
    setTime(0);
  }, []);

  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  // Cleanup blob URL при unmount.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const togglePreviewPlay = useCallback(() => {
    const v = previewVideoRef.current;
    if (!v) return;
    if (previewPlaying) { v.pause(); setPreviewPlaying(false); }
    else { v.play().then(() => setPreviewPlaying(true)).catch(() => {}); }
  }, [previewPlaying]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center gap-8 px-6"
    >
      {/* Кнопка закрытия — в углу, не теснит запись.
          Во время recording → confirm; в preview → discard. */}
      <button
        onClick={recording ? cancelRecording : (preview ? discardPreview : onCancel)}
        aria-label="Отменить"
        className="absolute top-6 right-6 w-11 h-11 rounded-full bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center text-white/75 hover:text-white transition-colors backdrop-blur-md"
      >
        <X size={20} />
      </button>

      {/* Круговой превью / playback */}
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
              stroke={nearLimit ? '#f97316' : '#ef4444'}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE - progress}
              style={{
                transition: 'stroke-dashoffset 1s linear, stroke 0.3s',
                filter: `drop-shadow(0 0 10px ${nearLimit ? 'rgba(249,115,22,0.7)' : 'rgba(239,68,68,0.6)'})`,
              }}
            />
          )}
        </svg>

        {/* Видео в круге: live preview ИЛИ playback отснятого */}
        <div className="absolute inset-3 rounded-full overflow-hidden bg-dark-bg ring-1 ring-white/10">
          {preview ? (
            // PREVIEW: видео-плеер отснятого
            <video
              ref={previewVideoRef}
              src={preview.url}
              playsInline
              onEnded={() => setPreviewPlaying(false)}
              className="w-full h-full object-cover cursor-pointer"
              onClick={togglePreviewPlay}
              style={{ transform: 'scaleX(-1)' }}
            />
          ) : (
            // LIVE: камера
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          )}

          {!ready && !preview && (
            <div className="absolute inset-0 flex items-center justify-center bg-dark-bg/60">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* REC-индикатор только при активной записи */}
          {recording && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/65 backdrop-blur-sm rounded-full px-2.5 py-1 z-10">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[11px] text-white font-semibold tracking-wide">REC</span>
            </div>
          )}

          {/* Play-overlay в preview-mode */}
          {preview && !previewPlaying && (
            <button
              onClick={togglePreviewPlay}
              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors z-10"
              aria-label="Воспроизвести"
            >
              <span className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center shadow-2xl">
                <Play size={28} className="text-dark-bg translate-x-0.5" fill="currentColor" />
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Скрытый canvas для превью-кадра */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Таймер + подсказка */}
      <div className="flex flex-col items-center gap-2">
        <div className={`text-3xl font-bold tabular-nums transition-colors ${
          nearLimit ? 'text-orange-400' : recording ? 'text-white' : preview ? 'text-white' : 'text-white/40'
        }`}>
          {fmt(preview ? preview.duration : time)}
          <span className="text-base text-white/35 font-normal ml-1">/ {fmt(MAX_DURATION)}</span>
        </div>
        <p className="text-white/65 text-[14px] leading-5">
          {!ready
            ? 'Запрашиваем доступ к камере…'
            : preview
            ? 'Готово. Отправить или переснять?'
            : recording
            ? (nearLimit ? `Осталось ${MAX_DURATION - time} сек` : 'Запись идёт — нажмите ■ чтобы закончить')
            : 'Нажмите кружок, чтобы начать запись'}
        </p>
      </div>

      {/* Управление: разное в зависимости от состояния */}
      <div className="flex items-center justify-center gap-8 min-h-[96px]">
        <AnimatePresence mode="wait" initial={false}>
          {/* IDLE: одна большая кнопка REC */}
          {!recording && !preview && (
            <motion.button
              key="idle"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1,   opacity: 1 }}
              exit={{    scale: 0.7, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              onClick={startRecording}
              disabled={!ready}
              aria-label="Начать запись"
              className="w-24 h-24 rounded-full bg-white hover:bg-white/95 flex items-center justify-center shadow-2xl ring-4 ring-white/10 active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="w-16 h-16 rounded-full bg-red-500" />
            </motion.button>
          )}

          {/* RECORDING: cancel слева, stop по центру */}
          {recording && !preview && (
            <motion.div
              key="rec"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{    opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-10"
            >
              <button
                onClick={cancelRecording}
                aria-label="Отменить запись"
                title="Отменить запись"
                className="w-14 h-14 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 flex items-center justify-center text-white/85 hover:text-white transition-all active:scale-95"
              >
                <Trash2 size={22} />
              </button>
              <button
                onClick={stopRecording}
                aria-label="Остановить запись"
                className="w-24 h-24 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-2xl shadow-red-500/50 ring-4 ring-red-500/20 active:scale-95 transition-transform"
              >
                <Square size={28} className="text-white" fill="currentColor" />
              </button>
            </motion.div>
          )}

          {/* PREVIEW: discard (←) play/pause toggle, send (→) */}
          {preview && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{    opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-10"
            >
              <button
                onClick={discardPreview}
                aria-label="Переснять"
                title="Переснять"
                className="w-14 h-14 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 flex items-center justify-center text-white/85 hover:text-white transition-all active:scale-95"
              >
                <Trash2 size={22} />
              </button>
              <button
                onClick={togglePreviewPlay}
                aria-label={previewPlaying ? 'Пауза' : 'Воспроизвести'}
                title={previewPlaying ? 'Пауза' : 'Воспроизвести'}
                className="w-14 h-14 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 flex items-center justify-center text-white/85 hover:text-white transition-all active:scale-95"
              >
                {previewPlaying ? <Pause size={22} /> : <Play size={22} fill="currentColor" />}
              </button>
              <button
                onClick={sendPreview}
                aria-label="Отправить"
                className="w-24 h-24 rounded-full bg-brand-gradient flex items-center justify-center shadow-2xl shadow-primary-500/40 active:scale-95 transition-transform"
              >
                <Send size={28} className="text-white -translate-x-0.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
