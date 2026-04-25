import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Send, X, Square } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
  onRecorded: (blob: Blob, duration: number, waveform: number[]) => void;
  onCancel: () => void;
}

const BAR_COUNT = 40;

export default function VoiceRecorder({ onRecorded, onCancel }: Props) {
  const [recording, setRecording] = useState(false);
  const [time, setTime] = useState(0);
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const [recordedBars, setRecordedBars] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const animFrameRef     = useRef<number | null>(null);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef        = useRef<BlobPart[]>([]);
  const barsHistoryRef   = useRef<number[]>([]);

  // Запускаем запись сразу при монтировании
  useEffect(() => {
    startRecording();
    return () => cleanup();
  }, []);

  const cleanup = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Web Audio API для визуализации
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mediaRecorderRef.current = mr;
      mr.start(100);

      setRecording(true);

      // Таймер
      timerRef.current = setInterval(() => {
        setTime((t) => {
          if (t >= 299) stopRecording(true);
          return t + 1;
        });
      }, 1000);

      // Анимация волны
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = Array.from(dataArray.slice(0, 30))
          .reduce((s, v) => s + v, 0) / 30 / 255;

        barsHistoryRef.current = [avg, ...barsHistoryRef.current].slice(0, BAR_COUNT);
        setBars([...barsHistoryRef.current, ...Array(BAR_COUNT).fill(0)].slice(0, BAR_COUNT));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);

    } catch {
      onCancel();
    }
  };

  const stopRecording = useCallback((send: boolean) => {
    if (!mediaRecorderRef.current) return;

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    const finalBars = [...barsHistoryRef.current].reverse();

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (send) {
        onRecorded(blob, time, finalBars);
      }
    };

    mediaRecorderRef.current.stop();
    setRecording(false);
  }, [time, onRecorded]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="flex items-center gap-3 bg-dark-card border border-dark-border rounded-2xl px-4 py-3"
    >
      {/* Cancel */}
      <button
        onClick={() => { stopRecording(false); onCancel(); }}
        className="w-9 h-9 rounded-full bg-dark-hover flex items-center justify-center text-white/60 hover:text-white flex-shrink-0"
      >
        <X size={18} />
      </button>

      {/* Waveform */}
      <div className="flex-1 flex items-center gap-[2px] h-10 overflow-hidden">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-full bg-primary-500 transition-all duration-75"
            style={{ height: `${Math.max(4, h * 36)}px`, opacity: 0.4 + h * 0.6 }}
          />
        ))}
      </div>

      {/* Time */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-sm font-medium tabular-nums text-white/80">{fmt(time)}</span>
      </div>

      {/* Send */}
      <button
        onClick={() => stopRecording(true)}
        className="w-9 h-9 rounded-full bg-primary-600 hover:bg-primary-500 flex items-center justify-center flex-shrink-0"
      >
        <Send size={15} className="text-white" />
      </button>
    </motion.div>
  );
}
