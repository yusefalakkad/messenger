/**
 * Контекстное меню сообщения.
 * Открывается правым кликом или долгим нажатием.
 */
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Reply, Pencil, Trash2 } from 'lucide-react';
import type { Message } from '@messenger/shared';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

interface Props {
  message: Message;
  isOwn:   boolean;
  x: number;
  y: number;
  onClose:  () => void;
  onReply:  () => void;
  onEdit?:  () => void;
  onDelete: () => void;
  onReact:  (emoji: string) => void;
}

export default function MessageContextMenu({
  message, isOwn, x, y, onClose, onReply, onEdit, onDelete, onReact,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Закрыть по клику вне меню
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Небольшая задержка чтобы не закрылось сразу от текущего события
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [onClose]);

  // Скорректировать позицию чтобы не вылезать за экран
  const menuW = 200;
  const menuH = 180;
  const adjX = Math.min(x, window.innerWidth  - menuW - 8);
  const adjY = Math.min(y, window.innerHeight - menuH - 8);

  const canEdit = isOwn && message.type === 'text' && !message.encrypted;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.12 }}
      style={{ position: 'fixed', left: adjX, top: adjY, zIndex: 200 }}
      className="bg-dark-card border border-dark-border rounded-2xl shadow-2xl overflow-hidden select-none"
    >
      {/* Быстрые реакции */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-dark-border">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onReact(emoji); onClose(); }}
            className="w-9 h-9 flex items-center justify-center text-xl rounded-xl hover:bg-dark-hover transition-all hover:scale-125 active:scale-110"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Действия */}
      <div className="py-1">
        <button
          onClick={() => { onReply(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-dark-hover transition-colors text-sm"
        >
          <Reply size={16} className="text-white/50" />
          <span>Ответить</span>
        </button>

        {canEdit && (
          <button
            onClick={() => { onEdit?.(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-dark-hover transition-colors text-sm"
          >
            <Pencil size={16} className="text-white/50" />
            <span>Редактировать</span>
          </button>
        )}

        {isOwn && (
          <button
            onClick={() => { onDelete(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-dark-hover transition-colors text-sm text-red-400"
          >
            <Trash2 size={16} />
            <span>Удалить</span>
          </button>
        )}
      </div>
    </motion.div>
  );
}
