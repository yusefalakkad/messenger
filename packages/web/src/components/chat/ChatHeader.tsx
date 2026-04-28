import { useState, useCallback, useRef, useEffect } from 'react';
import { Phone, Video, Search, MoreVertical, ShieldCheck, Trash2, UserPlus, PhoneCall } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import ProfilePanel from './ProfilePanel';
import AddMemberModal from './AddMemberModal';
import { isChatE2E } from '@/lib/e2e';
import { initiateCall, startGroupCall } from '@/lib/socket';
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
  const [showProfile,   setShowProfile]   = useState(false);
  const [showMenu,      setShowMenu]      = useState(false);
  const [confirmClear,  setConfirmClear]  = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const myUserId    = useAuthStore((s) => s.user?.id);
  const setOutgoing  = useCallStore((s) => s.setOutgoing);
  const setGroupCall = useCallStore((s) => s.setGroupCall);
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

  const startGroupCallFn = useCallback((callType: 'audio' | 'video') => {
    if (chat.type !== 'group') return;
    const callId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    startGroupCall(callId, chat.id, callType);
    setGroupCall({
      callId,
      chatId: chat.id,
      callType,
      participants: chat.members
        .filter((m) => m.userId === myUserId)
        .map((m) => ({ userId: m.userId, name: m.user.displayName, avatar: m.user.avatar })),
    });
  }, [chat, myUserId, setGroupCall]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

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
      <header className="flex items-center gap-3 px-4 py-3 border-b border-dark-border bg-dark-surface flex-shrink-0">
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

        <div className="flex items-center gap-1 flex-shrink-0">
          {peerId && (
            <button onClick={() => startCall('audio')}
              className="p-2 rounded-xl hover:bg-dark-hover transition-colors text-white/60 hover:text-white"
              title="Аудиозвонок">
              <Phone size={18} />
            </button>
          )}
          {peerId && (
            <button onClick={() => startCall('video')}
              className="p-2 rounded-xl hover:bg-dark-hover transition-colors text-white/60 hover:text-white"
              title="Видеозвонок">
              <Video size={18} />
            </button>
          )}
          {chat.type === 'group' && (
            <button onClick={() => startGroupCallFn('audio')}
              className="p-2 rounded-xl hover:bg-dark-hover transition-colors text-white/60 hover:text-white"
              title="Групповой звонок">
              <PhoneCall size={18} />
            </button>
          )}
          <button className="p-2 rounded-xl hover:bg-dark-hover transition-colors text-white/60 hover:text-white">
            <Search size={18} />
          </button>

          {/* More menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="p-2 rounded-xl hover:bg-dark-hover transition-colors text-white/60 hover:text-white">
              <MoreVertical size={18} />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-dark-card border border-dark-border rounded-2xl shadow-2xl overflow-hidden z-50">
                {chat.type === 'group' && (
                  <button
                    onClick={() => { setShowMenu(false); setShowAddMember(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-hover transition-colors text-sm text-white/80">
                    <UserPlus size={16} />
                    Добавить участника
                  </button>
                )}
                <button
                  onClick={() => { setShowMenu(false); setConfirmClear(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-hover transition-colors text-sm text-red-400">
                  <Trash2 size={16} />
                  Очистить чат
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Confirm clear dialog */}
      {confirmClear && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="font-semibold text-base mb-2">Очистить чат?</h3>
            <p className="text-sm text-white/50 mb-5">Все сообщения будут удалены безвозвратно.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 py-2.5 rounded-xl bg-dark-hover text-sm font-medium hover:bg-dark-border transition-colors">
                Отмена
              </button>
              <button
                onClick={handleClearChat}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-medium text-white transition-colors">
                Очистить
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showProfile && (
          <ProfilePanel
            chat={chat}
            otherMember={otherMember}
            onClose={() => setShowProfile(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddMember && (
          <AddMemberModal
            chatId={chat.id}
            existingMemberIds={chat.members.map((m) => m.userId)}
            onClose={() => setShowAddMember(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
