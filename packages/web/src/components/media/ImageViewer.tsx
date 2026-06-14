/**
 * Fullscreen media viewer — изображения и видео.
 * Закрыть: Escape, клик на фон или кнопку ✕. Скачать: кнопка ↓.
 */
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Download } from 'lucide-react';

interface Props {
  src: string;
  type?: 'image' | 'video';
  onClose: () => void;
}

export default function ImageViewer({ src, type = 'image', onClose }: Props) {
  // Закрыть по Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* Верхняя панель */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <X size={18} className="text-white" />
        </button>

        <a
          href={src}
          download
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Download size={18} className="text-white" />
        </a>
      </div>

      {/* Изображение. stopPropagation — ТОЛЬКО на самом медиа, чтобы клик по
          тёмной области вокруг фото/видео закрывал вьюер (как в Telegram). */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0">
        {type === 'video' ? (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-xl shadow-2xl"
          />
        ) : (
          <img
            src={src}
            alt="Просмотр"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl select-none"
            draggable={false}
          />
        )}
      </div>
    </motion.div>
  );
}
