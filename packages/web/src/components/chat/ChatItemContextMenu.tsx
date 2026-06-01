/**
 * Контекстное меню элемента списка чатов.
 * Открывается правым кликом или долгим нажатием на ChatListItem.
 *
 * Действия делают API-вызов, а локальное состояние придёт через socket
 * 'chat:state-updated' — оптимистично UI не обновляем, чтобы избежать рассинхронов.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Pin, PinOff, Archive, ArchiveRestore, Bell, BellOff, ChevronRight,
} from 'lucide-react';
import type { Chat } from '@messenger/shared';
import { pinChat, archiveChat, muteChat, isPinLimitError } from '@/lib/chats';
import { toast } from '@/lib/toast';

interface Props {
  chat: Chat;
  x: number;
  y: number;
  onClose: () => void;
}

const MENU_W = 230;
const MENU_H = 260;

export default function ChatItemContextMenu({ chat, x, y, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [muteOpen, setMuteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
      document.addEventListener('keydown', esc);
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const adjX = Math.min(x, window.innerWidth  - MENU_W - 8);
  const adjY = Math.min(y, window.innerHeight - MENU_H - 8);

  const isPinned   = !!chat.pinnedAt;
  const isArchived = !!chat.archivedAt;
  const isMuted    = !!chat.mutedUntil && (chat.mutedUntil === 'forever' || new Date(chat.mutedUntil).getTime() > Date.now());

  const togglePin = async () => {
    try {
      await pinChat(chat.id, !isPinned);
      toast.success(isPinned ? 'Чат откреплён' : 'Чат закреплён');
    } catch (err) {
      if (isPinLimitError(err)) {
        toast.error('Можно закрепить не больше 5 чатов');
      } else {
        toast.error('Не удалось изменить закрепление');
      }
    }
    onClose();
  };

  const toggleArchive = async () => {
    try {
      await archiveChat(chat.id, !isArchived);
      toast.success(isArchived ? 'Чат разархивирован' : 'Чат отправлен в архив');
    } catch {
      toast.error('Не удалось обновить архив');
    }
    onClose();
  };

  const doMute = async (until: string | null | 'forever', label: string) => {
    try {
      await muteChat(chat.id, until);
      toast.success(until === null ? 'Уведомления включены' : `Без звука: ${label}`);
    } catch {
      toast.error('Не удалось изменить уведомления');
    }
    onClose();
  };

  const muteOptions: Array<{ label: string; value: string | 'forever' | null }> = [
    { label: '1 час',      value: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    { label: '8 часов',    value: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() },
    { label: 'До завтра',  value: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
    { label: 'Навсегда',   value: 'forever' },
  ];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.14, ease: [0.32, 0.72, 0, 1] }}
      style={{ position: 'fixed', left: adjX, top: adjY, zIndex: 250, width: MENU_W }}
      className="glass rounded-2xl shadow-2xl shadow-black/60 overflow-hidden select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="py-1">
        <button onClick={togglePin} className="menu-item">
          <span className="text-primary-300 flex-shrink-0">
            {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
          </span>
          <span>{isPinned ? 'Открепить' : 'Закрепить'}</span>
        </button>

        <button onClick={toggleArchive} className="menu-item">
          <span className="text-primary-300 flex-shrink-0">
            {isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </span>
          <span>{isArchived ? 'Разархивировать' : 'Архивировать'}</span>
        </button>

        {/* Mute submenu */}
        <div className="relative">
          <button
            onClick={() => setMuteOpen((v) => !v)}
            className="menu-item w-full"
          >
            <span className="text-primary-300 flex-shrink-0">
              {isMuted ? <BellOff size={16} /> : <Bell size={16} />}
            </span>
            <span className="flex-1 text-left">{isMuted ? 'Уведомления' : 'Без звука'}</span>
            <ChevronRight size={14} className="text-white/40" />
          </button>

          {muteOpen && (
            <motion.div
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.14 }}
              className="px-1 pb-1"
            >
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl overflow-hidden">
                {isMuted && (
                  <button
                    onClick={() => doMute(null, 'включены')}
                    className="menu-item w-full"
                  >
                    <span className="text-emerald-400 flex-shrink-0"><Bell size={14} /></span>
                    <span>Включить</span>
                  </button>
                )}
                {muteOptions.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => doMute(opt.value, opt.label.toLowerCase())}
                    className="menu-item w-full"
                  >
                    <span className="w-4 flex-shrink-0" />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
