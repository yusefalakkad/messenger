import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { format, isToday } from 'date-fns';
import { clsx } from 'clsx';
import { Pin, BellOff, Bookmark, Megaphone } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { formatMessagePreview } from '@/lib/messagePreview';
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
  // Кто-то печатает в этом чате — показываем вместо превью.
  const typing = useChatStore((s) => (s.typingUsers[chat.id]?.size ?? 0) > 0);

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);

  const otherMember = chat.type === 'direct'
    ? chat.members.find((m) => m.userId !== user?.id)
    : null;

  const isSaved = chat.type === 'saved';
  const isChannel = chat.type === 'channel';
  const name = isSaved
    ? 'Избранное'
    : chat.type === 'group' || isChannel ? chat.name : otherMember?.user.displayName ?? 'Unknown';
  const avatar = chat.type === 'group' || isChannel ? chat.avatar : otherMember?.user.avatar;
  const isOnline = otherMember?.user.status === 'online';

  // P1-16: draft scoped per-user; согласовано с MessageInput.tsx.
  const draft = typeof window !== 'undefined' && user?.id
    ? localStorage.getItem(`draft:${user.id}:${chat.id}`)
    : null;
  const lastMsg = chat.lastMessage;

  // Если есть черновик — показываем его вместо последнего сообщения.
  // E2E-сообщения не расшифровываем синхронно — formatMessagePreview маркирует 🔒.
  const previewText = draft ? draft : formatMessagePreview(lastMsg);

  // Время как в Telegram: сегодня → ЧЧ:ММ, иначе → дд.ММ (без «0 секунд назад»).
  const lastTs = lastMsg ? new Date(lastMsg.createdAt) : null;
  const timeStr = lastTs ? (isToday(lastTs) ? format(lastTs, 'HH:mm') : format(lastTs, 'dd.MM')) : '';

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
          'relative w-full flex items-center gap-3 px-3 py-2.5 mx-2 text-left group',
          'transition-[transform,background-color,box-shadow] duration-200 ease-out',
          'active:scale-[0.985] active:duration-75',
          // Мобила — стеклянная карточка; десктоп — компактная плотная строка.
          'max-lg:liquid-card max-lg:rounded-2xl max-lg:mb-1.5 lg:rounded-lg',
          active
            ? 'max-lg:ring-1 max-lg:ring-white/35 -translate-y-px lg:bg-dark-card lg:shadow-e1'
            : 'hover:-translate-y-px lg:hover:bg-dark-hover/60',
        )}
        style={{ width: 'calc(100% - 1rem)' }}
      >
        {/* Активный чат — выраженная brand-полоса слева */}
        {active && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand-gradient shadow-glow-violet animate-pulse-glow" />
        )}
        {isSaved ? (
          <span className="w-10 h-10 rounded-full bg-brand-gradient flex items-center justify-center flex-shrink-0">
            <Bookmark size={18} className="text-white" />
          </span>
        ) : (
          <Avatar
            src={avatar}
            name={name ?? '?'}
            size="md"
            online={chat.type === 'direct' ? isOnline : undefined}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[15px] leading-5 truncate text-content/95 flex items-center gap-1.5">
              {isChannel && <Megaphone size={13} className="text-content/45 flex-shrink-0" />}
              {name}
            </span>
            <span className="text-content/45 text-[12px] leading-4 flex-shrink-0 font-medium flex items-center gap-1 tabular-nums">
              {isMuted && <BellOff size={11} className="text-content/40 opacity-70" />}
              {timeStr}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            {typing ? (
              <span className="text-[13px] leading-[18px] truncate text-primary-600 dark:text-primary-300 italic animate-pulse">
                печатает…
              </span>
            ) : (
              <span className="text-[13px] leading-[18px] truncate flex items-center gap-1">
                {draft && <span className="text-red-400/90 font-medium">Черновик:</span>}
                <span className={clsx('truncate', draft ? 'text-content/60' : 'text-content/55')}>
                  {previewText}
                </span>
              </span>
            )}
            <span className="flex items-center gap-1.5 flex-shrink-0">
              {isPinned && (chat.unreadCount ?? 0) === 0 && (
                <Pin size={12} className="text-accent-violet rotate-45" strokeWidth={2.5} />
              )}
              {(chat.unreadMentions ?? 0) > 0 && (
                <span className="w-[22px] h-[22px] rounded-full bg-brand-gradient shadow-glow-violet text-white text-[12px] font-bold flex items-center justify-center">
                  @
                </span>
              )}
              {(chat.unreadCount ?? 0) > 0 && (
                <span className={clsx(
                  'text-[12px] rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1.5 font-semibold tabular-nums',
                  isMuted
                    ? 'bg-content/15 text-content/70'
                    : 'bg-brand-gradient text-white shadow-glow-violet',
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
