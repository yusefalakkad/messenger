import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import { ru } from 'date-fns/locale';
import { clsx } from 'clsx';
import { Pin, BellOff } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/auth.store';
import type { Chat } from '@messenger/shared';
import ChatItemContextMenu from './ChatItemContextMenu';

interface Props {
  chat: Chat;
  active: boolean;
  onClick: () => void;
}

const LONG_PRESS_MS = 450;

export default function ChatListItem({ chat, active, onClick }: Props) {
  const user = useAuthStore((s) => s.user);

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);

  const otherMember = chat.type === 'direct'
    ? chat.members.find((m) => m.userId !== user?.id)
    : null;

  const name = chat.type === 'group' ? chat.name : otherMember?.user.displayName ?? 'Unknown';
  const avatar = chat.type === 'group' ? chat.avatar : otherMember?.user.avatar;
  const isOnline = otherMember?.user.status === 'online';

  const draft = typeof window !== 'undefined' ? localStorage.getItem(`draft:${chat.id}`) : null;
  const lastMsg = chat.lastMessage;

  // Если есть черновик — показываем его вместо последнего сообщения
  const previewText = draft
    ? draft
    : lastMsg
    ? lastMsg.type === 'text'
      ? lastMsg.content ?? ''
      : lastMsg.type === 'voice'
      ? '🎤 Голосовое'
      : lastMsg.type === 'circle'
      ? '⭕ Видео-кружок'
      : lastMsg.type === 'image'
      ? '📷 Фото'
      : lastMsg.type === 'video'
      ? '🎬 Видео'
      : '📎 Файл'
    : '';

  const timeStr = lastMsg
    ? formatDistanceToNowStrict(new Date(lastMsg.createdAt), { locale: ru, addSuffix: false })
    : '';

  const isPinned = !!chat.pinnedAt;
  const isMuted  = !!chat.mutedUntil && (chat.mutedUntil === 'forever' || new Date(chat.mutedUntil).getTime() > Date.now());

  const openMenuAt = (x: number, y: number) => {
    setMenu({ x, y });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    longPressTriggered.current = false;
    const t = e.touches[0];
    const x = t.clientX;
    const y = t.clientY;
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      // tactile hint if available
      if (navigator.vibrate) navigator.vibrate(15);
      openMenuAt(x, y);
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = () => {
    // Если только что сработал long-press — клик игнорируем.
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    onClick();
  };

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onTouchCancel={cancelLongPress}
        className={clsx(
          'relative w-full flex items-center gap-3 px-3 py-2.5 mx-1 rounded-xl text-left group',
          'active:scale-[0.985] hover:translate-x-0.5',
          active
            ? 'bg-white/[0.07] shadow-inner'
            : 'hover:bg-white/[0.045]',
          isPinned && !active && 'bg-accent-violet/[0.04]',
        )}
        style={{ width: 'calc(100% - 0.5rem)' }}
      >
        {active && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand-gradient animate-pulse-glow" />
        )}
        <Avatar
          src={avatar}
          name={name ?? '?'}
          size="md"
          online={chat.type === 'direct' ? isOnline : undefined}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm truncate text-white/95 flex items-center gap-1.5">
              {name}
            </span>
            <span className="text-white/30 text-[11px] flex-shrink-0 font-medium flex items-center gap-1">
              {isMuted && <BellOff size={11} className="text-white/35 opacity-70" />}
              {timeStr}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-xs truncate flex items-center gap-1">
              {draft && <span className="text-red-400/90 font-medium">Черновик:</span>}
              <span className={clsx('truncate', draft ? 'text-white/55' : 'text-white/50')}>
                {previewText}
              </span>
            </span>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              {isPinned && (chat.unreadCount ?? 0) === 0 && (
                <Pin size={12} className="text-accent-violet rotate-45" strokeWidth={2.5} />
              )}
              {(chat.unreadCount ?? 0) > 0 && (
                <span className={clsx(
                  'text-white text-[11px] rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 font-semibold',
                  isMuted
                    ? 'bg-white/15 text-white/70'
                    : 'bg-brand-gradient shadow-glow-violet',
                )}>
                  {chat.unreadCount}
                </span>
              )}
            </span>
          </div>
        </div>
        {/* Pin glyph в углу — только если есть unread, чтобы не дублировать иконку */}
        {isPinned && (chat.unreadCount ?? 0) > 0 && (
          <span className="absolute top-1.5 right-1.5 pointer-events-none">
            <Pin size={10} className="text-accent-violet rotate-45" strokeWidth={2.5} />
          </span>
        )}
      </button>

      {createPortal(
        <AnimatePresence>
          {menu && (
            <ChatItemContextMenu
              chat={chat}
              x={menu.x}
              y={menu.y}
              onClose={() => setMenu(null)}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
