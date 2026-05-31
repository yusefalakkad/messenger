import { useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { isChatE2E } from '@/lib/e2e';
import { ShieldCheck } from 'lucide-react';

export default function ChatWindow() {
  const { chatId } = useParams<{ chatId: string }>();
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const setMessages = useChatStore((s) => s.setMessages);
  const messages = useChatStore((s) => chatId ? s.messages[chatId] ?? [] : []);
  const chats = useChatStore((s) => s.chats);
  const user = useAuthStore((s) => s.user);
  const chat = chats.find((c) => c.id === chatId);

  useEffect(() => {
    if (!chatId) return;
    setActiveChat(chatId);
    api.get(`/chats/${chatId}/messages`).then(({ data }) => {
      setMessages(chatId, data.data ?? []);
    });
    return () => setActiveChat(null);
  }, [chatId, setActiveChat, setMessages]);

  if (!chatId || !chat) return null;

  const otherMember = chat.type === 'direct'
    ? chat.members.find((m) => m.userId !== user?.id)
    : null;

  const isE2E = isChatE2E(chat);

  return (
    <div className="flex flex-col h-full relative">
      <ChatHeader chat={chat} otherMember={otherMember ?? undefined} />

      {/* E2E-баннер — показывается один раз при открытии зашифрованного чата */}
      {isE2E && (
        <div className="flex items-center justify-center gap-1.5 py-1.5 bg-primary-600/10 border-b border-primary-500/20 flex-shrink-0 backdrop-blur-sm">
          <ShieldCheck size={12} className="text-primary-300" />
          <span className="text-[11px] text-primary-200/80 select-none">
            Сообщения защищены сквозным шифрованием
          </span>
        </div>
      )}

      <MessageList chatId={chatId} messages={messages} />
      <MessageInput chatId={chatId} />
    </div>
  );
}
