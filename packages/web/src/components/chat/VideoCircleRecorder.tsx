/**
 * Standalone circle recorder component — records a circular video message.
 * Shows live preview in a circle, records up to 60 seconds.
 * Used inline from MessageInput attach menu.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Square } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
  onRecorded: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

export default function VideoCircleRecorder({ onRecorded, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [time, setTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
      .then((s) => {
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
        }
      });
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = () => {
    if (!stream) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => chunksRef.current.push(e.data);
    mr.start();
    setRecorder(mr);
    setRecording(true);
    timerRef.current = setInterval(() => {
      setTime((t) => {
        if (t >= 59) { stopRecording(mr, t + 1); return 60; }
        return t + 1;
      });
    }, 1000);
  };

  const stopRecording = (mr?: MediaRecorder, finalTime?: number) => {
    const rec = mr ?? recorder;
    if (!rec) return;
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      onRecorded(blob, finalTime ?? time);
    };
    rec.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  };

  const progress = (time / 60) * 100;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
    >
      <div className="flex flex-col items-center gap-6 p-6">
        {/* Circle preview with progress ring */}
        <div className="relative w-64 h-64">
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 256 256">
            <circle cx="128" cy="128" r="120" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
            {recording && (
              <circle
                cx="128" cy="128" r="120"
                fill="none"
                stroke="#ef4444"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 120}`}
                strokeDashoffset={`${2 * Math.PI * 120 * (1 - progress / 100)}`}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            )}
          </svg>
          <div className="absolute inset-2 rounded-full overflow-hidden bg-dark-bg">
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-full h-full object-cover scale-x-[-1]"
            />
          </div>
          {recording && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {Math.floor(time / 60)}:{String(time % 60).padStart(2, '0')}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6">
          <button onClick={onCancel} className="p-3 rounded-full bg-dark-card hover:bg-dark-hover text-white/60">
            <X size={24} />
          </button>

          {!recording ? (
            <button
              onClick={startRecording}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center"
            >
              <span className="w-6 h-6 rounded-full bg-white" />
            </button>
          ) : (
            <button
              onClick={() => stopRecording()}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center"
            >
              <Square size={20} fill="white" className="text-white" />
            </button>
          )}
        </div>

        <p className="text-white/40 text-sm">
          {recording ? 'Нажмите для остановки' : 'Нажмите для записи кружка'}
        </p>
      </div>
    </motion.div>
  );
}
