/**
 * Пикер обоев чата: оверлей с сеткой пресетов 2×4
 * («По умолчанию» + 6 градиентных пресетов).
 * Выбор → PUT /chats/:id/wallpaper + оптимистичный updateChat + onClose.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useChatStore } from '@/stores/chat.store';
import { backdrop, popIn, tap } from '@/lib/motion';

interface Props {
  chatId: string;
  current: string | null | undefined;
  onClose: () => void;
}

// Пресеты фонов — те же градиенты, что рендерит ChatWindow
const PRESETS: { id: string | null; label: string; background: string }[] = [
  { id: null,     label: 'По умолчанию', background: '#17151e' },
  { id: 'aurora', label: 'Аврора',   background: 'linear-gradient(160deg,#1a1430,#251c4a 50%,#1a2438)' },
  { id: 'sunset', label: 'Закат',    background: 'linear-gradient(160deg,#2a1626,#3a1e2e 55%,#332220)' },
  { id: 'ocean',  label: 'Океан',    background: 'linear-gradient(160deg,#0f1d2b,#16283d 55%,#0f2233)' },
  { id: 'forest', label: 'Лес',      background: 'linear-gradient(160deg,#13211a,#1b2f24 55%,#16261f)' },
  { id: 'mono',   label: 'Минимал',  background: '#1c1b22' },
  { id: 'candy',  label: 'Конфетти', background: 'linear-gradient(160deg,#241632,#321a3e 50%,#3a1f33)' },
];

export default function WallpaperPicker({ chatId, current, onClose }: Props) {
  const updateChat = useChatStore((s) => s.updateChat);
  const [saving, setSaving] = useState(false);

  const pick = async (wallpaper: string | null) => {
    if (saving) return;
    setSaving(true);
    try {
      await api.put(`/chats/${chatId}/wallpaper`, { wallpaper });
      updateChat(chatId, { wallpaper });
      onClose();
    } catch {
      toast.error('Не удалось сменить обои');
      setSaving(false);
    }
  };

  return (
    <motion.div
      variants={backdrop}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        variants={popIn}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="relative z-modal max-w-sm w-full surface-2 rounded-2xl shadow-e4 p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-[15px]">Обои чата</h4>
          <button onClick={onClose} className="btn-icon btn-icon-sm" aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>

        {/* Сетка пресетов 2×4 */}
        <div className="grid grid-cols-4 gap-2.5">
          {PRESETS.map((p) => {
            const isActive = (current ?? null) === p.id;
            return (
              <motion.button
                key={p.id ?? 'default'}
                onClick={() => pick(p.id)}
                disabled={saving}
                aria-label={p.label}
                whileTap={saving ? undefined : tap}
                className="flex flex-col items-center gap-1.5 group disabled:opacity-60"
              >
                <span
                  style={{ background: p.background }}
                  className={`relative w-full aspect-square rounded-lg border transition-all duration-200
                              group-hover:brightness-125
                              ${isActive
                                ? 'border-transparent ring-2 ring-primary-500/80 shadow-glow-violet'
                                : 'border-dark-border group-hover:border-content/20'}`}
                >
                  {isActive && (
                    <motion.span
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                      className="absolute inset-0 m-auto w-6 h-6 rounded-full bg-brand-gradient flex items-center justify-center shadow-e2"
                    >
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </motion.span>
                  )}
                </span>
                <span className={`text-[12px] leading-4 transition-colors ${isActive ? 'text-primary-600 dark:text-primary-300 font-medium' : 'text-content/60 group-hover:text-content/80'}`}>
                  {p.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
