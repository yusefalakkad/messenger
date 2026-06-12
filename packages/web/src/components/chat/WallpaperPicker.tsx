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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="max-w-sm w-[calc(100vw-2rem)] rounded-xl bg-dark-card border border-dark-border shadow-e3 p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-[15px]">Обои чата</h4>
          <button onClick={onClose} className="btn-icon btn-icon-sm" aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>

        {/* Сетка пресетов 2×4 */}
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((p) => {
            const isActive = (current ?? null) === p.id;
            return (
              <button
                key={p.id ?? 'default'}
                onClick={() => pick(p.id)}
                disabled={saving}
                aria-label={p.label}
                className="flex flex-col items-center gap-1.5 group disabled:opacity-60"
              >
                <span
                  style={{ background: p.background }}
                  className={`relative w-[72px] h-[72px] rounded-lg border border-dark-border
                              transition group-hover:brightness-125
                              ${isActive ? 'ring-2 ring-primary-500/70' : ''}`}
                >
                  {isActive && (
                    <Check
                      size={16}
                      className="absolute inset-0 m-auto text-primary-300"
                    />
                  )}
                </span>
                <span className={`text-[12px] leading-4 ${isActive ? 'text-primary-300' : 'text-white/60'}`}>
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
