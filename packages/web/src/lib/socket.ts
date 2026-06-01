import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { useCallStore } from '@/stores/call.store';
import { playNotificationSound } from '@/lib/notificationSound';
import { SOCKET_URL } from '@/lib/config';
import type { Message, WSServerEvents, Chat, SendMessagePayload, CallType } from '@messenger/shared';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function initSocket(): Socket {
  const token = useAuthStore.getState().accessToken;

  // Защита от двойной инициализации
  if (socket?.connected) {
    return socket;
  }

  // Отключаем старый сокет если есть
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  const getChatStore = () => useChatStore.getState();

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Error:', err.message);
  });

  // Новый чат создан — добавляем в список и присоединяемся к комнате
  socket.on('chat:new', (chat: Chat) => {
    getChatStore().addChat(chat);
  });

  // Новое сообщение
  socket.on('message:new', (message: Message) => {
    const { activeChatId } = useChatStore.getState();
    const myUserId = useAuthStore.getState().user?.id;
    getChatStore().addMessage(message.chatId, message);

    // Звук + системное уведомление для входящих сообщений
    if (message.senderId !== myUserId) {
      playNotificationSound();
      maybeShowNotification(message);
    }

    // Если чат открыт — сразу отмечаем прочитанным
    if (activeChatId === message.chatId && socket) {
      socket.emit('message:read', { messageId: message.id, chatId: message.chatId });
    }
  });

  socket.on('message:updated', (update: Partial<Message> & { id: string }) => {
    // Ищем в каком чате это сообщение
    const { messages } = useChatStore.getState();
    for (const [chatId, msgs] of Object.entries(messages)) {
      if (msgs.some((m) => m.id === update.id)) {
        getChatStore().updateMessage(chatId, update.id, update);
        break;
      }
    }
  });

  socket.on('message:deleted', ({ messageId, chatId }: { messageId: string; chatId: string }) => {
    getChatStore().deleteMessage(chatId, messageId);
  });

  socket.on('message:read', ({ messageId, chatId, userId, readAt }: WSServerEvents['message:read']) => {
    getChatStore().updateMessage(chatId, messageId, {
      readBy: [{ userId, readAt: new Date(readAt) }],
    });
  });

  socket.on('user:typing', ({ chatId, userId, isTyping }: WSServerEvents['user:typing']) => {
    getChatStore().setTyping(chatId, userId, isTyping);
  });

  socket.on('message:reacted', ({ messageId, chatId, userId, emoji, action }: WSServerEvents['message:reacted']) => {
    getChatStore().applyReaction(chatId, messageId, userId, emoji, action);
  });

  // ── Calls ─────────────────────────────────────────────────────────────────

  socket.on('call:incoming', (data: WSServerEvents['call:incoming']) => {
    useCallStore.getState().setIncoming(data);
  });

  socket.on('call:accepted', ({ callId, peerId }: WSServerEvents['call:accepted']) => {
    const { outgoing } = useCallStore.getState();
    if (outgoing?.callId === callId) {
      useCallStore.getState().setActive({
        callId,
        peerId,
        chatId: outgoing.chatId,
        callType: outgoing.callType,
        startedAt: new Date(),
        isInitiator: true,
      });
    }
  });

  socket.on('call:ended', ({ callId, reason }: WSServerEvents['call:ended']) => {
    const { active, incoming, outgoing } = useCallStore.getState();
    if (
      active?.callId === callId ||
      incoming?.callId === callId ||
      outgoing?.callId === callId
    ) {
      useCallStore.getState().clearCall();
      // Trigger global event so CallOverlay can tear down WebRTC
      window.dispatchEvent(new CustomEvent('call:ended', { detail: { callId, reason } }));
    }
  });

  socket.on('call:signal', (data: WSServerEvents['call:signal']) => {
    window.dispatchEvent(new CustomEvent('call:signal', { detail: data }));
  });

  // Состояние чата изменилось (pin/archive/mute) — обновляем стор.
  // Сервер всегда присылает per-user поля; пересортировку делает бэкенд
  // (мы лишь приподнимем закреплённые наверх в селекторе).
  socket.on('chat:state-updated', (payload: {
    chatId: string;
    pinned?:      boolean;
    archived?:    boolean;
    pinnedAt?:    string | null;
    archivedAt?:  string | null;
    mutedUntil?:  string | null;
  }) => {
    const update: Partial<Chat> = {};
    if ('pinnedAt'   in payload) update.pinnedAt   = payload.pinnedAt   ?? null;
    if ('archivedAt' in payload) update.archivedAt = payload.archivedAt ?? null;
    if ('mutedUntil' in payload) update.mutedUntil = payload.mutedUntil ?? null;
    getChatStore().updateChat(payload.chatId, update);
  });

  socket.on('user:status', ({ userId, status }: WSServerEvents['user:status']) => {
    useChatStore.setState((s) => ({
      chats: s.chats.map((chat) => ({
        ...chat,
        members: chat.members.map((m) =>
          m.userId === userId ? { ...m, user: { ...m.user, status } } : m,
        ),
      })),
    }));
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function sendMessage(payload: SendMessagePayload): void {
  socket?.emit('message:send', payload);
}

export function sendTyping(chatId: string, isTyping: boolean): void {
  socket?.emit('message:typing', { chatId, isTyping });
}

export function markRead(messageId: string, chatId: string): void {
  socket?.emit('message:read', { messageId, chatId });
}

export function editMessage(messageId: string, chatId: string, content: string): void {
  socket?.emit('message:edit', { messageId, chatId, content });
}

export function deleteMessage(messageId: string, chatId: string): void {
  socket?.emit('message:delete', { messageId, chatId });
}

export function reactToMessage(messageId: string, chatId: string, emoji: string): void {
  socket?.emit('message:react', { messageId, chatId, emoji });
}

// ── Call signaling ────────────────────────────────────────────────────────────

export function initiateCall(callId: string, peerId: string, chatId: string, callType: CallType): void {
  socket?.emit('call:initiate', { callId, peerId, chatId, callType });
}

export function acceptCall(callId: string): void {
  socket?.emit('call:accept', { callId });
}

export function rejectCall(callId: string): void {
  socket?.emit('call:reject', { callId });
}

export function endCall(callId: string): void {
  socket?.emit('call:end', { callId });
}

export function sendCallSignal(callId: string, signal: RTCSessionDescriptionInit | RTCIceCandidateInit): void {
  socket?.emit('call:signal', { callId, signal });
}

// ── In-tab Notification API (когда таб открыт но не активен) ──────────────────

function maybeShowNotification(message: Message): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // активная вкладка — звука хватит
  try {
    const title = message.sender?.displayName ?? 'Новое сообщение';
    const body =
      message.encrypted   ? '🔒 Зашифрованное сообщение' :
      message.type === 'image'  ? '📷 Фото'   :
      message.type === 'video'  ? '🎬 Видео'  :
      message.type === 'voice'  ? '🎤 Голосовое' :
      message.type === 'circle' ? '⭕ Видео-кружок' :
      message.type === 'file'   ? '📎 Файл'   :
      (message.content ?? '').slice(0, 120);
    const n = new Notification(title, {
      body,
      icon: message.sender?.avatar ?? '/icon-192.png',
      tag:  message.chatId,
    });
    n.onclick = () => {
      window.focus();
      window.location.assign(`/chat/${message.chatId}`);
      n.close();
    };
  } catch { /* */ }
}
