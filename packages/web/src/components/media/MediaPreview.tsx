/**
 * Превью медиа перед отправкой — показывает фото/видео
 * с возможностью добавить подпись и отправить или отменить.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Image, Video } from 'lucide-react';

export interface PendingMedia {
  file:      File;
  type:      'image' | 'video';
  previewUrl: string;
}

interface Props {
  media:    PendingMedia;
  onSend:   (caption?: string) => void;
  onCancel: () => void;
}

export default function MediaPreview({ media, onSend, onCancel }: Props) {
  const [caption, setCaption] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
    >
      {/* Верхняя панель */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
        >
          <X size={18} className="text-white" />
        </button>
        <div className="flex items-center gap-2 text-white/60 text-sm">
          {media.type === 'image' ? <Image size={16} /> : <Video size={16} />}
          <span>{media.type === 'image' ? 'Фото' : 'Видео'}</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Превью */}
      <div className="flex-1 flex items-center justify-center px-4 min-h-0">
        {media.type === 'image' ? (
          <img
            src={media.previewUrl}
            alt="preview"
            className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
          />
        ) : (
          <video
            src={media.previewUrl}
            controls
            className="max-w-full max-h-full rounded-2xl shadow-2xl"
          />
        )}
      </div>

      {/* Нижняя панель — подпись + отправить */}
      <div className="flex items-end gap-3 px-4 py-4 flex-shrink-0">
        <input
          className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white
                     placeholder-white/40 outline-none focus:border-primary-500/50 text-sm"
          placeholder="Добавить подпись..."
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend(caption)}
        />
        <button
          onClick={() => onSend(caption || undefined)}
          className="w-12 h-12 rounded-full bg-primary-600 hover:bg-primary-500 flex items-center justify-center shadow-lg shadow-primary-600/30 flex-shrink-0"
        >
          <Send size={18} className="text-white" />
        </button>
      </div>
    </motion.div>
  );
}
