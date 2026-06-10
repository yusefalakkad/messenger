import { useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { isChatE2E } from '@/lib/e2e';
import { ShieldCheck, MessageSquareOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Message } from '@messenger/shared';

// P2-22: стабильная ссылка на пустой массив — иначе селектор возвращает свежий
// [] каждый рендер и компонент перерендеривается на любую store-мутацию.
const EMPTY_MESSAGES: Message[] = [];

export default function ChatWindow() {
  const { chatId } = useParams<{ chatId: string }>();
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const mergeMessages = useChatStore((s) => s.mergeMessages);
  const messages = useChatStore((s) => chatId ? s.messages[chatId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES);
  const chats = useChatStore((s) => s.chats);
  const user = useAuthStore((s) => s.user);
  const chat = chats.find((c) => c.id === chatId);

  useEffect(() => {
    if (!chatId) return;
    setActiveChat(chatId);
    // P1-12: mergeMessages вместо setMessages — пока летел GET, через сокет
    // могли прилететь live-сообщения. setMessages их затирал.
    api.get(`/chats/${chatId}/messages`).then(({ data }) => {
      mergeMessages(chatId, data.data ?? []);
    });
    return () => setActiveChat(null);
  }, [chatId, setActiveChat, mergeMessages]);

  if (!chatId) return null;

  // Если чаты ещё грузятся (chats === []) — показываем skeleton.
  // Если уже загрузились но chat не найден — empty-state.
  if (!chat) {
    const stillLoading = chats.length === 0;
    return (
      <div className="flex flex-col h-full relative items-center justify-center text-center px-6">
        {stillLoading ? (
          <div className="flex flex-col items-center gap-3 text-white/40">
            <div className="w-10 h-10 rounded-full border-2 border-primary-500/40 border-t-primary-500 animate-spin" />
            <p className="text-sm">Загружаем чат...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/50 max-w-xs">
            <MessageSquareOff size={32} className="text-white/40" />
            <p className="text-sm">Чат не найден или вас исключили из него.</p>
            <Link to="/chat" className="text-primary-400 hover:text-primary-300 text-sm font-medium">
              ← К списку чатов
            </Link>
          </div>
        )}
      </div>
    );
  }

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
