import { useState, useCallback } from 'react';
import { Phone, Video, Search, MoreVertical, ShieldCheck } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import ProfilePanel from './ProfilePanel';
import { isChatE2E } from '@/lib/e2e';
import { initiateCall } from '@/lib/socket';
import { useCallStore } from '@/stores/call.store';
import { useAuthStore } from '@/stores/auth.store';
import type { Chat, ChatMember } from '@messenger/shared';

interface Props {
  chat: Chat;
  otherMember?: ChatMember;
}

export default function ChatHeader({ chat, otherMember }: Props) {
  const [showProfile, setShowProfile] = useState(false);
  const myUserId  = useAuthStore((s) => s.user?.id);
  const setOutgoing = useCallStore((s) => s.setOutgoing);

  const name     = chat.type === 'group' ? chat.name : otherMember?.user.displayName;
  const avatar   = chat.type === 'group' ? chat.avatar : otherMember?.user.avatar;
  const isOnline = otherMember?.user.status === 'online';
  const e2e      = isChatE2E(chat);
  const subtitle = chat.type === 'group'
    ? `${chat.members.length} участников`
    : isOnline ? 'в сети' : 'не в сети';

  // Только для прямых чатов — звонки
  const peerId = chat.type === 'direct'
    ? chat.members.find((m) => m.userId !== myUserId)?.userId
    : undefined;

  const startCall = useCallback((callType: 'audio' | 'video') => {
    if (!peerId) return;
    const callId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    initiateCall(callId, peerId, chat.id, callType);
    setOutgoing({ callId, chatId: chat.id, peerId, callType });
  }, [peerId, chat.id, setOutgoing]);

  return (
    <>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-dark-border bg-dark-surface flex-shrink-0">
        {/* Кликабельная зона — аватар + имя */}
        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
          onClick={() => setShowProfile(true)}
        >
          <Avatar
            src={avatar}
            name={name ?? '?'}
            size="md"
            online={chat.type === 'direct' ? isOnline : undefined}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold text-sm truncate">{name}</h2>
              {e2e && <ShieldCheck size={13} className="text-primary-400 flex-shrink-0" />}
            </div>
            <p className={`text-xs truncate ${isOnline ? 'text-green-400' : 'text-white/40'}`}>
              {subtitle}
            </p>
          </div>
        </button>

        {/* Кнопки справа */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {peerId && (
            <button
              onClick={() => startCall('audio')}
              className="p-2 rounded-xl hover:bg-dark-hover transition-colors text-white/60 hover:text-white"
              title="Аудиозвонок"
            >
              <Phone size={18} />
            </button>
          )}
          {peerId && (
            <button
              onClick={() => startCall('video')}
              className="p-2 rounded-xl hover:bg-dark-hover transition-colors text-white/60 hover:text-white"
              title="Видеозвонок"
            >
              <Video size={18} />
            </button>
          )}
          <button className="p-2 rounded-xl hover:bg-dark-hover transition-colors text-white/60 hover:text-white">
            <Search size={18} />
          </button>
          <button className="p-2 rounded-xl hover:bg-dark-hover transition-colors text-white/60 hover:text-white">
            <MoreVertical size={18} />
          </button>
        </div>
      </header>

      {/* Панель профиля — вне <header>, позиционируется по ChatWindow (relative) */}
      <AnimatePresence>
        {showProfile && (
          <ProfilePanel
            chat={chat}
            otherMember={otherMember}
            onClose={() => setShowProfile(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
