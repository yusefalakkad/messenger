import { create } from 'zustand';
import type { Chat, Message } from '@messenger/shared';

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
  prependMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (chatId: string, messageId: string, update: Partial<Message>) => void;
  deleteMessage: (chatId: string, messageId: string) => void;

  setReplyingTo:     (m: Message | null) => void;
  setEditingMessage: (m: Message | null) => void;

  applyReaction: (chatId: string, messageId: string, userId: string, emoji: string, action: 'add' | 'remove') => void;

  setTyping: (chatId: string, userId: string, isTyping: boolean) => void;
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
      return {
        messages: { ...s.messages, [chatId]: [...existing, message] },
        chats: s.chats.map((c) =>
          c.id === chatId ? { ...c, lastMessage: message, unreadCount: c.id === s.activeChatId ? 0 : (c.unreadCount ?? 0) + 1 } : c,
        ),
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
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) =>
          m.id === messageId ? { ...m, deletedAt: new Date() } : m,
        ),
      },
    })),

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
}));
