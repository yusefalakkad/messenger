import { formatDistanceToNowStrict } from 'date-fns';
import { ru } from 'date-fns/locale';
import { clsx } from 'clsx';
import Avatar from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/auth.store';
import type { Chat } from '@messenger/shared';

interface Props {
  chat: Chat;
  active: boolean;
  onClick: () => void;
}

export default function ChatListItem({ chat, active, onClick }: Props) {
  const user = useAuthStore((s) => s.user);

  const otherMember = chat.type === 'direct'
    ? chat.members.find((m) => m.userId !== user?.id)
    : null;

  const name = chat.type === 'group' ? chat.name : otherMember?.user.displayName ?? 'Unknown';
  const avatar = chat.type === 'group' ? chat.avatar : otherMember?.user.avatar;
  const isOnline = otherMember?.user.status === 'online';

  const lastMsg = chat.lastMessage;
  const lastText = lastMsg
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

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left',
        active ? 'bg-primary-600/20' : 'hover:bg-dark-hover',
      )}
    >
      <Avatar
        src={avatar}
        name={name ?? '?'}
        size="md"
        online={chat.type === 'direct' ? isOnline : undefined}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm truncate">{name}</span>
          <span className="text-white/30 text-xs flex-shrink-0">{timeStr}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-white/50 text-xs truncate">{lastText}</span>
          {(chat.unreadCount ?? 0) > 0 && (
            <span className="bg-primary-600 text-white text-xs rounded-full min-w-5 h-5 flex items-center justify-center px-1.5 flex-shrink-0">
              {chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
