import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { useCallStore } from '@/stores/call.store';
import { playNotificationSound } from '@/lib/notificationSound';
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

  socket = io('/', {
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

    // Звук уведомления для входящих сообщений
    if (message.senderId !== myUserId) {
      playNotificationSound();
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

  // ── Group call events ─────────────────────────────────────────────────────

  socket.on('call:group-incoming', (data: WSServerEvents['call:group-incoming']) => {
    useCallStore.getState().setGroupCall({
      callId:       data.callId,
      chatId:       data.chatId,
      callType:     data.callType,
      participants: [{
        userId: data.initiatorId,
        name:   data.initiatorName,
        avatar: data.initiatorAvatar,
      }],
    });
    window.dispatchEvent(new CustomEvent('call:group-incoming', { detail: data }));
  });

  socket.on('call:peer-joined', (data: WSServerEvents['call:peer-joined']) => {
    useCallStore.getState().addParticipant({
      userId: data.peerId,
      name:   data.peerName,
      avatar: data.peerAvatar,
    });
    window.dispatchEvent(new CustomEvent('call:peer-joined', { detail: data }));
  });

  socket.on('call:peer-left', (data: WSServerEvents['call:peer-left']) => {
    useCallStore.getState().removeParticipant(data.peerId);
    window.dispatchEvent(new CustomEvent('call:peer-left', { detail: data }));
  });

  // ── Chat member events (Task 4) ───────────────────────────────────────────

  socket.on('chat:memberAdded', ({ chatId, member }: { chatId: string; member: import('@messenger/shared').ChatMember }) => {
    useChatStore.setState((s) => ({
      chats: s.chats.map((c) => {
        if (c.id !== chatId) return c;
        const exists = c.members.some((m) => m.userId === member.userId);
        return exists ? c : { ...c, members: [...c.members, member] };
      }),
    }));
  });

  socket.on('chat:memberRemoved', ({ chatId, userId: removedUserId }: { chatId: string; userId: string }) => {
    useChatStore.setState((s) => ({
      chats: s.chats.map((c) => {
        if (c.id !== chatId) return c;
        return { ...c, members: c.members.filter((m) => m.userId !== removedUserId) };
      }),
    }));
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

export function startGroupCall(callId: string, chatId: string, callType: import('@messenger/shared').CallType): void {
  socket?.emit('call:group-start', { callId, chatId, callType });
}

export function joinGroupCall(callId: string, chatId: string): void {
  socket?.emit('call:group-join', { callId, chatId });
}

export function leaveGroupCall(callId: string): void {
  socket?.emit('call:group-leave', { callId });
}
