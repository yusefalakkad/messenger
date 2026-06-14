import { useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useChatStore } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import ChatHeader from './ChatHeader';
import PinnedMessagesBar from '@/components/chat/PinnedMessagesBar';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import SelectionBar from './SelectionBar';
import { MessageSquareOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Message } from '@messenger/shared';

// P2-22: стабильная ссылка на пустой массив — иначе селектор возвращает свежий
// [] каждый рендер и компонент перерендеривается на любую store-мутацию.
const EMPTY_MESSAGES: Message[] = [];

// Пресеты обоев чата — ключи совпадают с валидными значениями
// PUT /chats/:id/wallpaper на бэке. null/неизвестное = фон по умолчанию.
const WALLPAPERS: Record<string, string> = {
  aurora: 'linear-gradient(160deg,#1a1430,#251c4a 50%,#1a2438)',
  sunset: 'linear-gradient(160deg,#2a1626,#3a1e2e 55%,#332220)',
  ocean:  'linear-gradient(160deg,#0f1d2b,#16283d 55%,#0f2233)',
  forest: 'linear-gradient(160deg,#13211a,#1b2f24 55%,#16261f)',
  mono:   '#1c1b22',
  candy:  'linear-gradient(160deg,#241632,#321a3e 50%,#3a1f33)',
};

// Стиль фона: пресет (градиент/цвет), кастомная картинка (URL) или дефолт (undefined).
function wallpaperStyle(wp: string | null | undefined) {
  if (!wp) return undefined;
  if (WALLPAPERS[wp]) return { background: WALLPAPERS[wp] };
  return {
    backgroundImage: `url("${wp}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  } as const;
}

export default function ChatWindow() {
  const { chatId } = useParams<{ chatId: string }>();
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const mergeMessages = useChatStore((s) => s.mergeMessages);
  const requestJump = useChatStore((s) => s.requestJump);
  const clearMessageSelection = useChatStore((s) => s.clearMessageSelection);
  const updateChat = useChatStore((s) => s.updateChat);
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

  // Смена чата — сбрасываем выделение сообщений
  useEffect(() => {
    clearMessageSelection();
  }, [chatId, clearMessageSelection]);

  if (!chatId) return null;

  // Если чаты ещё грузятся (chats === []) — показываем skeleton.
  // Если уже загрузились но chat не найден — empty-state.
  if (!chat) {
    const stillLoading = chats.length === 0;
    return (
      <div className="flex flex-col h-full relative items-center justify-center text-center px-6">
        {stillLoading ? (
          <div className="flex flex-col items-center gap-3 text-content/40">
            <div className="w-10 h-10 rounded-full border-2 border-primary-500/40 border-t-primary-500 animate-spin" />
            <p className="text-sm">Загружаем чат...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-content/50 max-w-xs">
            <MessageSquareOff size={32} className="text-content/40" />
            <p className="text-sm">Чат не найден или вас исключили из него.</p>
            <Link to="/chat" className="text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 text-sm font-medium">
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

  // Канал: писать могут только owner/admin. Обычному подписчику вместо
  // поля ввода показываем бар с toggle уведомлений.
  const myRole = chat.members.find((m) => m.userId === user?.id)?.role;
  const isChannelReader = chat.type === 'channel' && myRole !== 'owner' && myRole !== 'admin';
  const isMuted = !!chat.mutedUntil && new Date(chat.mutedUntil).getTime() > Date.now();

  const toggleMute = async () => {
    // null — уведомления включены; «вечный» mute — дата в далёком будущем
    const mutedUntil = isMuted ? null : '2100-01-01T00:00:00.000Z';
    try {
      await api.post(`/chats/${chat.id}/mute`, { mutedUntil });
      updateChat(chat.id, { mutedUntil });
    } catch {
      toast.error('Не удалось изменить настройки уведомлений');
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Бар выделения — absolute поверх шапки, сам рендерит null когда пусто */}
      <SelectionBar chatId={chatId} />
      <ChatHeader chat={chat} otherMember={otherMember ?? undefined} />
      <PinnedMessagesBar chatId={chatId} onJump={(id) => requestJump(chatId, id)} />

      {/* Обои чата: фон области сообщений по chat.wallpaper (self-настройка ChatMember) */}
      <div
        className="flex-1 min-h-0 flex flex-col"
        style={wallpaperStyle(chat.wallpaper)}
      >
        <MessageList chatId={chatId} messages={messages} />
      </div>
      {isChannelReader ? (
        <div className="flex items-center h-14 px-3 border-t border-dark-border bg-dark-surface/70 backdrop-blur-xl flex-shrink-0">
          <button className="btn-ghost btn-block" onClick={toggleMute}>
            {isMuted ? 'Включить уведомления' : 'Выключить уведомления'}
          </button>
        </div>
      ) : (
        <MessageInput chatId={chatId} />
      )}
    </div>
  );
}
