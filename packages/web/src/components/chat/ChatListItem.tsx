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

  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative w-full flex items-center gap-3 px-3 py-2.5 mx-1 rounded-xl text-left group',
        'active:scale-[0.985] hover:translate-x-0.5',
        active
          ? 'bg-white/[0.07] shadow-inner'
          : 'hover:bg-white/[0.045]',
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
          <span className="font-semibold text-sm truncate text-white/95">{name}</span>
          <span className="text-white/30 text-[11px] flex-shrink-0 font-medium">{timeStr}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs truncate flex items-center gap-1">
            {draft && <span className="text-red-400/90 font-medium">Черновик:</span>}
            <span className={clsx('truncate', draft ? 'text-white/55' : 'text-white/50')}>
              {previewText}
            </span>
          </span>
          {(chat.unreadCount ?? 0) > 0 && (
            <span className="bg-brand-gradient text-white text-[11px] rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 flex-shrink-0 font-semibold shadow-glow-violet">
              {chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
