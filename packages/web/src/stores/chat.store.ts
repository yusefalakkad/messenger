import { create } from 'zustand';
import type { Chat, Message } from '@messenger/shared';
import { useAuthStore } from '@/stores/auth.store';

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, Set<string>>;

  // Reply / Edit state
  replyingTo:     Message | null;
  editingMessage: Message | null;

  // Мульти-выбор сообщений (SelectionBar)
  selectedMessageIds: string[];

  // Jump-to-message: запрос прыжка (seq — инкремент-счётчик, чтобы повторный
  // прыжок к тому же сообщению тоже триггерил подписчиков)
  jumpRequest: { chatId: string; messageId: string; seq: number } | null;
  // Кратковременная подсветка пузыря после прыжка
  highlightMessageId: string | null;

  setChats: (chats: Chat[]) => void;
  addChat: (chat: Chat) => void;
  updateChat: (chatId: string, update: Partial<Chat>) => void;
  setActiveChat: (chatId: string | null) => void;

  setMessages: (chatId: string, messages: Message[]) => void;
  /** Сливает серверный снапшот с локальным состоянием по id (без потери optimistic). */
  mergeMessages: (chatId: string, messages: Message[]) => void;
  clearMessages: (chatId: string) => void;
  prependMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (chatId: string, messageId: string, update: Partial<Message>) => void;
  deleteMessage: (chatId: string, messageId: string) => void;

  setReplyingTo:     (m: Message | null) => void;
  setEditingMessage: (m: Message | null) => void;

  /** P3-4: накапливает read-receipt (без перезаписи readBy одним юзером). */
  addReadReceipt: (chatId: string, messageId: string, userId: string, readAt: Date) => void;

  toggleMessageSelection: (messageId: string) => void;
  clearMessageSelection: () => void;

  /** Запросить прыжок к сообщению (MessageList подписан на jumpRequest). */
  requestJump: (chatId: string, messageId: string) => void;
  /** Сбросить обработанный jumpRequest. */
  consumeJump: () => void;
  setHighlightMessage: (id: string | null) => void;

  applyReaction: (chatId: string, messageId: string, userId: string, emoji: string, action: 'add' | 'remove') => void;

  /** Пин/анпин сообщения (от сервера приходит ISO-строка или null). */
  setMessagePinned: (chatId: string, messageId: string, pinnedAt: string | null) => void;
  /** Полная замена голосов опроса (сервер шлёт актуальный снапшот). */
  applyPollVotes: (chatId: string, messageId: string, votes: { optionId: string; userId: string }[]) => void;
  /** Батч-удаление истёкших по TTL сообщений (как deleteMessage, но списком). */
  expireMessages: (chatId: string, ids: string[]) => void;

  /** Одноразовое сообщение просмотрено — фиксируем viewedAt и убираем медиа. */
  markMessageViewed: (chatId: string, messageId: string) => void;

  setTyping: (chatId: string, userId: string, isTyping: boolean) => void;

  /** Полный ресет — при logout. См. resetAppState(). */
  reset: () => void;
}

// Счётчик seq для jumpRequest — НЕ Date.now(): два быстрых прыжка в одну мс
// дали бы одинаковый seq и второй не сработал бы.
let jumpSeq = 0;

// Таймеры авто-сброса «печатает…» (ключ `chatId:userId`). Вне стора — это
// сайд-эффект, не состояние. Защита от залипшего индикатора (P-typing).
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  activeChatId: null,
  messages: {},
  typingUsers: {},
  replyingTo:     null,
  editingMessage: null,
  selectedMessageIds: [],
  jumpRequest: null,
  highlightMessageId: null,

  setChats: (chats) => set({ chats }),

  addChat: (chat) =>
    set((s) => ({ chats: [chat, ...s.chats.filter((c) => c.id !== chat.id)] })),

  updateChat: (chatId, update) =>
    set((s) => ({
      chats: s.chats.map((c) => (c.id === chatId ? { ...c, ...update } : c)),
    })),

  setActiveChat: (activeChatId) => set((s) => ({
    activeChatId,
    replyingTo:     null,
    editingMessage: null,
    // Выбор сообщений привязан к открытому чату — при смене сбрасываем.
    selectedMessageIds: [],
    chats: activeChatId
      ? s.chats.map((c) => c.id === activeChatId ? { ...c, unreadCount: 0, unreadMentions: 0 } : c)
      : s.chats,
  })),

  setMessages: (chatId, messages) =>
    set((s) => ({ messages: { ...s.messages, [chatId]: messages } })),

  // P1-12: merge вместо replace. Если пока ждали серверный снапшот, через сокет
  // пришли live-сообщения — они в локальном state, но НЕ в server payload. replace
  // их затёр бы. mergeMessages берёт server-снапшот как «правду» (порядок и метаданные),
  // и добавляет в конец локальные сообщения, отсутствующие в snapshot'е.
  mergeMessages: (chatId, incoming) =>
    set((s) => {
      const local = s.messages[chatId] ?? [];
      const incomingIds = new Set(incoming.map((m) => m.id));
      // Сохраняем только локальные, отсутствующие в server-снапшоте.
      const onlyLocal = local.filter((m) => !incomingIds.has(m.id));
      // Сортируем по createdAt чтобы новые legitimately встали в правильное место.
      const merged = [...incoming, ...onlyLocal].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      return { messages: { ...s.messages, [chatId]: merged } };
    }),

  clearMessages: (chatId) =>
    set((s) => ({ messages: { ...s.messages, [chatId]: [] } })),

  prependMessages: (chatId, older) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: [...older, ...(s.messages[chatId] ?? [])],
      },
    })),

  addMessage: (chatId, message) =>
    set((s) => {
      const existing = s.messages[chatId] ?? [];
      // Avoid duplicates
      if (existing.some((m) => m.id === message.id)) return s;
      // P2-8: unreadCount бампим ТОЛЬКО для чужих сообщений. Иначе forward
      // в не-активный чат накручивает счётчик пользователю на собственный echo.
      const me     = useAuthStore.getState().user;
      const isMine = message.senderId === me?.id;
      // Упоминание меня по @username (только незашифрованный текст — в E2E
      // content нечитаем). Регистр игнорируем.
      const isMention = !isMine
        && !!me?.username
        && !message.encrypted
        && !!message.content?.toLowerCase().includes('@' + me.username.toLowerCase());
      return {
        messages: { ...s.messages, [chatId]: [...existing, message] },
        chats: s.chats.map((c) => {
          if (c.id !== chatId) return c;
          const incrementUnread = !isMine && c.id !== s.activeChatId;
          return {
            ...c,
            lastMessage: message,
            unreadCount: incrementUnread ? (c.unreadCount ?? 0) + 1 : (c.id === s.activeChatId ? 0 : c.unreadCount ?? 0),
            // Mention-бейдж: как unreadCount — копим только в неактивных чатах
            // (для активного setActiveChat и так держит 0).
            unreadMentions: incrementUnread && isMention
              ? (c.unreadMentions ?? 0) + 1
              : (c.id === s.activeChatId ? 0 : c.unreadMentions ?? 0),
          };
        }),
      };
    }),

  updateMessage: (chatId, messageId, update) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) =>
          m.id === messageId ? { ...m, ...update } : m,
        ),
      },
    })),

  deleteMessage: (chatId, messageId) =>
    set((s) => {
      const msgs = (s.messages[chatId] ?? []).map((m) =>
        m.id === messageId ? { ...m, deletedAt: new Date() } : m,
      );
      // P2-9: если удалили последнее сообщение чата, обновляем lastMessage в sidebar.
      // Иначе превью в списке чатов остаётся «удалённым» текстом.
      const newLast = [...msgs].reverse().find((m) => !m.deletedAt) ?? null;
      return {
        messages: { ...s.messages, [chatId]: msgs },
        chats: s.chats.map((c) => {
          if (c.id !== chatId) return c;
          if (c.lastMessage?.id !== messageId) return c;
          return { ...c, lastMessage: newLast };
        }),
      };
    }),

  setReplyingTo:     (m) => set({ replyingTo: m }),
  setEditingMessage: (m) => set({ editingMessage: m, replyingTo: null }),

  // P3-4: раньше handler 'message:read' звал updateMessage с readBy=[один юзер],
  // затирая прочтения остальных участников группы. Теперь накапливаем.
  addReadReceipt: (chatId, messageId, userId, readAt) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) => {
          if (m.id !== messageId) return m;
          const others = (m.readBy ?? []).filter((r) => r.userId !== userId);
          return { ...m, readBy: [...others, { userId, readAt }] };
        }),
      },
    })),

  toggleMessageSelection: (messageId) =>
    set((s) => ({
      selectedMessageIds: s.selectedMessageIds.includes(messageId)
        ? s.selectedMessageIds.filter((id) => id !== messageId)
        : [...s.selectedMessageIds, messageId],
    })),

  clearMessageSelection: () => set({ selectedMessageIds: [] }),

  requestJump: (chatId, messageId) =>
    set({ jumpRequest: { chatId, messageId, seq: ++jumpSeq } }),

  consumeJump: () => set({ jumpRequest: null }),

  setHighlightMessage: (highlightMessageId) => set({ highlightMessageId }),

  applyReaction: (chatId, messageId, userId, emoji, action) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) => {
          if (m.id !== messageId) return m;
          const prev = m.reactions ?? [];
          const reactions = action === 'add'
            ? [...prev.filter((r) => !(r.userId === userId && r.emoji === emoji)), { userId, emoji }]
            : prev.filter((r) => !(r.userId === userId && r.emoji === emoji));
          return { ...m, reactions };
        }),
      },
    })),

  setMessagePinned: (chatId, messageId, pinnedAt) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) =>
          m.id === messageId ? { ...m, pinnedAt } : m,
        ),
      },
    })),

  applyPollVotes: (chatId, messageId, votes) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) =>
          m.id === messageId && m.poll ? { ...m, poll: { ...m.poll, votes } } : m,
        ),
      },
    })),

  expireMessages: (chatId, ids) =>
    set((s) => {
      const idSet = new Set(ids);
      const msgs = (s.messages[chatId] ?? []).map((m) =>
        idSet.has(m.id) ? { ...m, deletedAt: new Date() } : m,
      );
      // Как в deleteMessage: если истекло последнее сообщение чата —
      // подменяем lastMessage свежайшим неудалённым, чтобы sidebar не врал.
      const newLast = [...msgs].reverse().find((m) => !m.deletedAt) ?? null;
      return {
        messages: { ...s.messages, [chatId]: msgs },
        chats: s.chats.map((c) => {
          if (c.id !== chatId) return c;
          if (!c.lastMessage || !idSet.has(c.lastMessage.id)) return c;
          return { ...c, lastMessage: newLast };
        }),
      };
    }),

  // View-once: получатель просмотрел — сервер уже уничтожил файл в MinIO,
  // у нас остаётся только плейсхолдер «Просмотрено» (media обнуляем).
  markMessageViewed: (chatId, messageId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) =>
          m.id === messageId ? { ...m, viewedAt: new Date(), media: undefined } : m,
        ),
      },
    })),

  setTyping: (chatId, userId, isTyping) =>
    set((s) => {
      const current = new Set(s.typingUsers[chatId] ?? []);
      if (isTyping) {
        current.add(userId);
        // Auto-expire: индикатор «печатает…» сбрасывается через 6с, если не пришёл
        // свежий typing:true. Защищает от «залипания», когда событие typing:false
        // потерялось (отправитель закрыл вкладку / упал сокет). Telegram-паттерн.
        const key = `${chatId}:${userId}`;
        const prev = typingTimers.get(key);
        if (prev) clearTimeout(prev);
        typingTimers.set(key, setTimeout(() => {
          typingTimers.delete(key);
          useChatStore.getState().setTyping(chatId, userId, false);
        }, 6000));
      } else {
        current.delete(userId);
        const key = `${chatId}:${userId}`;
        const prev = typingTimers.get(key);
        if (prev) { clearTimeout(prev); typingTimers.delete(key); }
      }
      return { typingUsers: { ...s.typingUsers, [chatId]: current } };
    }),

  reset: () => set({
    chats: [],
    activeChatId: null,
    messages: {},
    typingUsers: {},
    replyingTo: null,
    editingMessage: null,
    selectedMessageIds: [],
    jumpRequest: null,
    highlightMessageId: null,
  }),
}));
