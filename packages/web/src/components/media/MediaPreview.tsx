/**
 * Превью медиа перед отправкой — показывает фото/видео
 * с возможностью добавить подпись, включить одноразовый просмотр («1×»)
 * и отправить или отменить.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { X, Send, Image as ImageIcon, Video, Eye } from 'lucide-react';
import { SPRING, tap } from '@/lib/motion';

export interface PendingMedia {
  file:      File;
  type:      'image' | 'video';
  previewUrl: string;
}

interface Props {
  media:    PendingMedia;
  onSend:   (caption?: string, viewOnce?: boolean) => void;
  onCancel: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024)      return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
}

export default function MediaPreview({ media, onSend, onCancel }: Props) {
  const [caption,  setCaption]  = useState('');
  // Одноразовый просмотр: медиа удаляется после первого открытия получателем
  const [viewOnce, setViewOnce] = useState(false);
  const fileName = media.file.name || (media.type === 'image' ? 'Фото' : 'Видео');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-overlay bg-black/95 backdrop-blur-sm flex flex-col"
    >
      {/* Top bar — h-16 единый с ChatHeader, safe-area сверху */}
      <div
        className="flex items-center gap-3 px-4 h-16 flex-shrink-0 border-b border-dark-border"
        style={{ paddingTop: 'var(--sat, 0px)' }}
      >
        <motion.button
          onClick={onCancel}
          aria-label="Закрыть"
          whileTap={tap}
          transition={SPRING.snappy}
          className="btn-icon flex-shrink-0 !text-white/85"
        >
          <X size={20} />
        </motion.button>
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
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING.smooth}
          className="max-w-full max-h-full flex items-center justify-center"
        >
          {media.type === 'image' ? (
            <img
              src={media.previewUrl}
              alt="preview"
              className="max-w-full max-h-full object-contain rounded-2xl shadow-e4"
            />
          ) : (
            <video
              src={media.previewUrl}
              controls
              playsInline
              className="max-w-full max-h-full rounded-2xl shadow-e4"
            />
          )}
        </motion.div>
      </div>

      {/* Bottom bar — подпись + send */}
      <div
        className="flex items-end gap-2.5 px-4 pt-3 pb-3 flex-shrink-0 border-t border-dark-border bg-black/40 backdrop-blur-md"
        style={{ paddingBottom: 'calc(var(--sab, 0px) + 0.75rem)' }}
      >
        {/* Toggle «1×» — одноразовый просмотр */}
        <motion.button
          onClick={() => setViewOnce((v) => !v)}
          aria-pressed={viewOnce}
          title="Одноразовый просмотр"
          whileTap={tap}
          transition={SPRING.snappy}
          className={clsx(
            'inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-lg flex-shrink-0 transition-colors',
            viewOnce
              ? 'bg-primary-500/20 text-primary-500 dark:text-primary-200 border border-primary-500/45 shadow-glow-violet'
              : 'text-white/65 hover:text-white bg-white/[0.06] border border-dark-border hover:bg-white/[0.1]',
          )}
        >
          <Eye size={16} />
          <span className="text-[12px] font-semibold tabular-nums">1×</span>
          {viewOnce && <span className="text-[12px] font-medium">Одноразовое</span>}
        </motion.button>
        <input
          className="flex-1 bg-white/[0.06] border border-dark-border rounded-lg h-11 px-4
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
              onSend(caption || undefined, viewOnce);
            }
          }}
        />
        <motion.button
          onClick={() => onSend(caption || undefined, viewOnce)}
          aria-label="Отправить"
          whileHover={{ scale: 1.05 }}
          whileTap={tap}
          transition={SPRING.snappy}
          className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0
                     text-white bg-brand-gradient shadow-glow-violet"
        >
          <Send size={18} />
        </motion.button>
      </div>
    </motion.div>
  );
}
