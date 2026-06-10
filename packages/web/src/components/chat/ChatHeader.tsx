import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Video, Search, MoreVertical, ShieldCheck, Trash2, ChevronLeft, Users } from 'lucide-react';
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
import { toast } from '@/lib/toast';
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
  const setGroupCall = useCallStore((s) => s.setGroupCall);
  const activeGroupCall = useCallStore((s) => s.group);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const [startingGroupCall, setStartingGroupCall] = useState(false);

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

  // Групповой звонок через LiveKit SFU. Совершенно отдельный от 1-на-1:
  // запрашиваем токен у бэка, открываем GroupCallView, который сам коннектится.
  const startGroupCall = useCallback(async () => {
    if (chat.type !== 'group' || startingGroupCall) return;
    // Если уже в групповом звонке этого же чата — просто разворачиваем.
    if (activeGroupCall?.chatId === chat.id) {
      useCallStore.getState().setGroupMinimized(false);
      return;
    }
    if (activeGroupCall) {
      toast.error('Вы уже в групповом звонке');
      return;
    }
    setStartingGroupCall(true);
    try {
      const { data } = await api.post('/livekit/token', { chatId: chat.id });
      const payload = data?.data as { token: string; url: string; room: string } | undefined;
      if (!payload?.token || !payload?.url) {
        toast.error('Не удалось получить токен звонка');
        return;
      }
      setGroupCall({
        chatId:    chat.id,
        chatName:  chat.name ?? 'Групповой звонок',
        url:       payload.url,
        token:     payload.token,
        room:      payload.room,
        startedAt: new Date(),
        minimized: false,
      });
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      if (code === 'LIVEKIT_DISABLED') {
        toast.error('Групповые звонки временно недоступны');
      } else {
        toast.error('Не удалось начать звонок');
      }
    } finally {
      setStartingGroupCall(false);
    }
  }, [chat.id, chat.name, chat.type, activeGroupCall, setGroupCall, startingGroupCall]);

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
      {/* Высота 64px (h-16), padding x16/y0 — стандарт messenger-headers по 8-сетке.
          На мобиле — h-15 (60) и компактный отступ от safe-area. */}
      <header className="flex items-center gap-2 px-4 h-16 pt-[var(--sat)] border-b border-dark-border bg-dark-surface/70 backdrop-blur-xl flex-shrink-0">
        <IconBtn onClick={() => navigate('/')} className="lg:hidden -ml-2" title="Назад">
          <ChevronLeft size={20} />
        </IconBtn>

        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity h-full"
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
              <h4 className="truncate">{name}</h4>
              {e2e && <ShieldCheck size={13} className="text-primary-300 flex-shrink-0" />}
            </div>
            <p className={`text-[12px] leading-4 truncate mt-0.5 font-medium ${isOnline ? 'text-green-400' : 'text-white/45'}`}>
              {subtitle}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
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
          {chat.type === 'group' && (
            <IconBtn
              onClick={startGroupCall}
              title="Групповой звонок"
              active={activeGroupCall?.chatId === chat.id}
              disabled={startingGroupCall}
            >
              <Users size={18} />
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
