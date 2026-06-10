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

  applyReaction: (chatId: string, messageId: string, userId: string, emoji: string, action: 'add' | 'remove') => void;

  setTyping: (chatId: string, userId: string, isTyping: boolean) => void;

  /** Полный ресет — при logout. См. resetAppState(). */
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  activeChatId: null,
  messages: {},
  typingUsers: {},
  replyingTo:     null,
  editingMessage: null,

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
    chats: activeChatId
      ? s.chats.map((c) => c.id === activeChatId ? { ...c, unreadCount: 0 } : c)
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
      const myUserId = useAuthStore.getState().user?.id;
      const isMine   = message.senderId === myUserId;
      return {
        messages: { ...s.messages, [chatId]: [...existing, message] },
        chats: s.chats.map((c) => {
          if (c.id !== chatId) return c;
          const incrementUnread = !isMine && c.id !== s.activeChatId;
          return {
            ...c,
            lastMessage: message,
            unreadCount: incrementUnread ? (c.unreadCount ?? 0) + 1 : (c.id === s.activeChatId ? 0 : c.unreadCount ?? 0),
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

  setTyping: (chatId, userId, isTyping) =>
    set((s) => {
      const current = new Set(s.typingUsers[chatId] ?? []);
      if (isTyping) current.add(userId);
      else current.delete(userId);
      return { typingUsers: { ...s.typingUsers, [chatId]: current } };
    }),

  reset: () => set({
    chats: [],
    activeChatId: null,
    messages: {},
    typingUsers: {},
    replyingTo: null,
    editingMessage: null,
  }),
}));
