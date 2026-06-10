/**
 * Превью медиа перед отправкой — показывает фото/видео
 * с возможностью добавить подпись и отправить или отменить.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Image as ImageIcon, Video } from 'lucide-react';

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

function formatSize(bytes: number): string {
  if (bytes < 1024)      return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
}

export default function MediaPreview({ media, onSend, onCancel }: Props) {
  const [caption, setCaption] = useState('');
  const fileName = media.file.name || (media.type === 'image' ? 'Фото' : 'Видео');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col"
    >
      {/* Top bar — h-16 единый с ChatHeader, safe-area сверху */}
      <div
        className="flex items-center gap-3 px-4 h-16 flex-shrink-0 border-b border-white/[0.06]"
        style={{ paddingTop: 'var(--sat, 0px)' }}
      >
        <button
          onClick={onCancel}
          aria-label="Закрыть"
          className="w-10 h-10 rounded-md bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center text-white/85 hover:text-white transition-colors flex-shrink-0"
        >
          <X size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-white/95">
            {media.type === 'image' ? <ImageIcon size={15} className="text-white/55 flex-shrink-0" /> : <Video size={15} className="text-white/55 flex-shrink-0" />}
            <span className="font-semibold text-[15px] truncate">{fileName}</span>
          </div>
          <p className="text-[12px] text-white/45 tabular-nums leading-tight mt-0.5">
            {media.type === 'image' ? 'Фото' : 'Видео'} · {formatSize(media.file.size)}
          </p>
        </div>
      </div>

      {/* Превью — fills remaining space, центрируется внутри */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0">
        {media.type === 'image' ? (
          <img
            src={media.previewUrl}
            alt="preview"
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
          />
        ) : (
          <video
            src={media.previewUrl}
            controls
            playsInline
            className="max-w-full max-h-full rounded-xl shadow-2xl"
          />
        )}
      </div>

      {/* Bottom bar — подпись + send */}
      <div
        className="flex items-end gap-3 px-4 pt-3 pb-3 flex-shrink-0 border-t border-white/[0.06] bg-black/40 backdrop-blur-md"
        style={{ paddingBottom: 'calc(var(--sab, 0px) + 0.75rem)' }}
      >
        <input
          className="flex-1 bg-white/[0.06] border border-white/[0.10] rounded-lg h-11 px-4
                     text-white text-[15px] placeholder:text-white/40 outline-none
                     focus:border-primary-500/60 focus:ring-2 focus:ring-primary-500/20
                     focus:bg-white/[0.08] transition"
          placeholder="Добавить подпись…"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={1024}
          onKeyDown={(e) => {
            // IME-композиция (китайский/японский/русский с переключением) — Enter подтверждает кандидата,
            // не должен отправлять сообщение.
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend(caption);
            }
          }}
        />
        <button
          onClick={() => onSend(caption || undefined)}
          aria-label="Отправить"
          className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0
                     text-white shadow-glow-violet active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg, #8a52ff 0%, #d04df0 60%, #ff5a8f 100%)' }}
        >
          <Send size={18} />
        </button>
      </div>
    </motion.div>
  );
}
