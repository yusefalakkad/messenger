import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Video, Search, MoreVertical, ShieldCheck, Trash2, ChevronLeft } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import IconBtn from '@/components/ui/IconBtn';
import Dropdown, { DropdownItem } from '@/components/ui/Dropdown';
import Dialog, { DialogButton } from '@/components/ui/Dialog';
import ProfilePanel from './ProfilePanel';
import ChatSearch from './ChatSearch';
import { isChatE2E } from '@/lib/e2e';
import { initiateCall } from '@/lib/socket';
import { useCallStore } from '@/stores/call.store';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { api } from '@/lib/api';
import type { Chat, ChatMember } from '@messenger/shared';

interface Props {
  chat: Chat;
  otherMember?: ChatMember;
}

export default function ChatHeader({ chat, otherMember }: Props) {
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);
  const [showMenu,    setShowMenu]    = useState(false);
  const [showSearch,  setShowSearch]  = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const myUserId  = useAuthStore((s) => s.user?.id);
  const setOutgoing = useCallStore((s) => s.setOutgoing);
  const clearMessages = useChatStore((s) => s.clearMessages);

  const name     = chat.type === 'group' ? chat.name : otherMember?.user.displayName;
  const avatar   = chat.type === 'group' ? chat.avatar : otherMember?.user.avatar;
  const isOnline = otherMember?.user.status === 'online';
  const e2e      = isChatE2E(chat);
  const subtitle = chat.type === 'group'
    ? `${chat.members.length} участников`
    : isOnline ? 'в сети' : 'не в сети';

  const peerId = chat.type === 'direct'
    ? chat.members.find((m) => m.userId !== myUserId)?.userId
    : undefined;

  const startCall = useCallback((callType: 'audio' | 'video') => {
    if (!peerId) return;
    const callId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    initiateCall(callId, peerId, chat.id, callType);
    setOutgoing({ callId, chatId: chat.id, peerId, callType });
  }, [peerId, chat.id, setOutgoing]);

  const handleClearChat = async () => {
    try {
      await api.delete(`/chats/${chat.id}/messages`);
      clearMessages(chat.id);
    } catch {}
    setConfirmClear(false);
    setShowMenu(false);
  };

  return (
    <>
      <header className="flex items-center gap-2 px-3 lg:px-4 py-3 border-b border-white/[0.05] bg-dark-surface/70 backdrop-blur-xl flex-shrink-0">
        <IconBtn onClick={() => navigate('/')} className="lg:hidden -ml-1" title="Назад">
          <ChevronLeft size={20} />
        </IconBtn>

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
              <h2 className="font-semibold text-base truncate leading-tight">{name}</h2>
              {e2e && <ShieldCheck size={13} className="text-primary-300 flex-shrink-0" />}
            </div>
            <p className={`text-xs truncate mt-0.5 font-medium ${isOnline ? 'text-green-400' : 'text-white/40'}`}>
              {subtitle}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {peerId && (
            <IconBtn onClick={() => startCall('audio')} title="Аудиозвонок">
              <Phone size={18} />
            </IconBtn>
          )}
          {peerId && (
            <IconBtn onClick={() => startCall('video')} title="Видеозвонок">
              <Video size={18} />
            </IconBtn>
          )}
          <IconBtn onClick={() => setShowSearch(true)} title="Поиск в чате">
            <Search size={18} />
          </IconBtn>

          <div className="relative">
            <IconBtn onClick={() => setShowMenu((v) => !v)} active={showMenu}>
              <MoreVertical size={18} />
            </IconBtn>
            <Dropdown open={showMenu} onClose={() => setShowMenu(false)}>
              <DropdownItem
                icon={<Trash2 size={16} />} label="Очистить чат" danger
                onClick={() => { setShowMenu(false); setConfirmClear(true); }}
              />
            </Dropdown>
          </div>
        </div>
      </header>

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Очистить чат?"
        description="Все сообщения будут удалены безвозвратно."
        footer={
          <>
            <DialogButton onClick={() => setConfirmClear(false)}>Отмена</DialogButton>
            <DialogButton variant="danger" onClick={handleClearChat}>Очистить</DialogButton>
          </>
        }
      />

      <AnimatePresence>
        {showSearch && (
          <ChatSearch chatId={chat.id} onClose={() => setShowSearch(false)} />
        )}
      </AnimatePresence>

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
