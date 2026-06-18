import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { useCallStore } from '@/stores/call.store';
import { playNotificationSound } from '@/lib/notificationSound';
import { getNotifPrefs } from '@/lib/prefs';
import { SOCKET_URL } from '@/lib/config';
import { api } from '@/lib/api';
import { clearKeyCache } from '@/lib/e2e';
import { toast } from '@/lib/toast';
import type { Message, WSServerEvents, Chat, SendMessagePayload, CallType } from '@messenger/shared';

let socket: Socket | null = null;

// Флаг — был ли уже хотя бы один успешный коннект В ЖИЗНЕННОМ ЦИКЛЕ СЕССИИ.
// КРИТИЧНО: на уровне модуля, не в closure initSocket() — иначе любой повторный
// initSocket (rotate token, reconnect handler) сбрасывает флаг в false и resync не запускается.
let hadInitialConnectEver = false;

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
    // Сначала websocket (эффективнее), но с откатом на polling. Без отката
    // ws-only обрывал realtime-синхронизацию, если апгрейд не проходил —
    // например в десктоп-приложении (через локальный прокси) или за прокси/CDN,
    // которые режут WebSocket. Polling идёт обычным HTTP и работает всегда.
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  const getChatStore = () => useChatStore.getState();

  socket.on('connect', () => {
    if (hadInitialConnectEver) {
      // Это RECONNECT после disconnect — у нас потенциально пропущены сообщения.
      // Пересинхронизируем активный чат и список чатов.
      void resyncAfterReconnect();
    } else {
      hadInitialConnectEver = true;
      // P1-18: outbox-сообщения, набранные ДО первого коннекта (offline-launch),
      // должны улететь как только сокет встал. Раньше drain был только внутри
      // resyncAfterReconnect, который на первом connect не вызывается.
      drainOutbox();
    }
  });

  socket.on('disconnect', () => { /* socket.io сам ретраит */ });

  // Сервер обнаружил критическую ошибку (rate-limit, forbidden, validation)
  socket.on('error', (data: { code?: string; message?: string; retryAfter?: number }) => {
    // Медленный режим: показываем сколько осталось ждать вместо generic-сообщения
    if (data?.code === 'SLOW_MODE') {
      const sec = Math.max(1, Math.ceil(data.retryAfter ?? 0));
      toast.error(`Медленный режим: подождите ${sec} сек`);
      return;
    }
    if (data?.message) toast.error(data.message);
  });

  // Новый чат создан — добавляем в список и присоединяемся к комнате
  socket.on('chat:new', (chat: Chat) => {
    getChatStore().addChat(chat);
  });

  // Новое сообщение
  socket.on('message:new', (message: Message & { clientMsgId?: string }) => {
    const { activeChatId } = useChatStore.getState();
    const myUserId = useAuthStore.getState().user?.id;
    // Если это наш собственный echo — снимаем pending-ack.
    if (message.clientMsgId && message.senderId === myUserId) {
      ackMessage(message.clientMsgId);
    }
    getChatStore().addMessage(message.chatId, message);

    // Звук + системное уведомление для входящих сообщений
    if (message.senderId !== myUserId) {
      // Локальные prefs: звук можно выключить в настройках уведомлений
      if (getNotifPrefs().sound) playNotificationSound();
      maybeShowNotification(message);
    }

    // Если чат открыт — сразу отмечаем прочитанным. Свои сообщения НЕ отмечаем:
    // иначе self-read красил бы галочку «прочитано» ещё до того, как прочёл собеседник.
    if (activeChatId === message.chatId && socket && message.senderId !== myUserId) {
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

  // P3-4: НАКАПЛИВАЕМ read-receipts. Раньше updateMessage перезаписывал readBy
  // массивом из одного юзера — в группе чтение вторым затирало первого.
  socket.on('message:read', ({ messageId, chatId, userId, readAt }: WSServerEvents['message:read']) => {
    getChatStore().addReadReceipt(chatId, messageId, userId, new Date(readAt));
  });

  socket.on('user:typing', ({ chatId, userId, isTyping }: WSServerEvents['user:typing']) => {
    getChatStore().setTyping(chatId, userId, isTyping);
  });

  socket.on('message:reacted', ({ messageId, chatId, userId, emoji, action }: WSServerEvents['message:reacted']) => {
    getChatStore().applyReaction(chatId, messageId, userId, emoji, action);
  });

  // ── Calls ─────────────────────────────────────────────────────────────────

  socket.on('call:incoming', (data: WSServerEvents['call:incoming']) => {
    const cs = useCallStore.getState();
    // P1-4: busy. Если уже есть активный/исходящий/входящий ИЛИ групповой звонок —
    // автоматически отшиваем второй, чтобы UI не показывал две панели и случайный
    // accept не ломал первый звонок.
    if (cs.active || cs.outgoing || cs.incoming || cs.group) {
      try { rejectCall(data.callId); } catch { /* ignore */ }
      toast.error(`Пропущенный звонок от ${data.callerName ?? 'неизвестно'}`);
      return;
    }
    cs.setIncoming(data);
    // P1-5: рингтон. playNotificationSound — короткий beep, нам нужен loop пока
    // звонок не принят/отклонён. Запускаем в CallOverlay через CustomEvent —
    // оверлей подпишется и запустит <audio loop> + поднимет system Notification.
    window.dispatchEvent(new CustomEvent('call:ring-start', { detail: data }));
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
      // Trigger global event so CallOverlay can tear down WebRTC + stop ringing.
      window.dispatchEvent(new CustomEvent('call:ended', { detail: { callId, reason } }));
      window.dispatchEvent(new CustomEvent('call:ring-stop'));
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

  // E2E public-key одного из собеседников сменился (он перелогинился на новом
  // устройстве). Чистим shared-key cache + патчим публичный ключ в чатах.
  socket.on('user:key-changed', ({ userId, publicKey }: { userId: string; publicKey: string }) => {
    useChatStore.setState((s) => ({
      chats: s.chats.map((chat) => ({
        ...chat,
        members: chat.members.map((m) =>
          m.userId === userId ? { ...m, user: { ...m.user, publicKey } } : m,
        ),
      })),
    }));
    clearKeyCache();
  });

  // TTL чата изменился (исчезающие сообщения)
  socket.on('chat:ttl-changed', ({ chatId, seconds }: WSServerEvents['chat:ttl-changed']) => {
    getChatStore().updateChat(chatId, { messageTtlSeconds: seconds });
  });

  // Медленный режим чата изменился (owner/admin переключил)
  socket.on('chat:slowmode-changed', ({ chatId, seconds }: WSServerEvents['chat:slowmode-changed']) => {
    getChatStore().updateChat(chatId, { slowModeSeconds: seconds });
  });

  // Одноразовое сообщение просмотрено получателем — медиа уничтожено на сервере
  socket.on('message:viewed', ({ chatId, messageId }: WSServerEvents['message:viewed']) => {
    getChatStore().markMessageViewed(chatId, messageId);
  });

  // Сообщение закреплено/откреплено
  socket.on('message:pinned', ({ chatId, messageId, pinnedAt }: WSServerEvents['message:pinned']) => {
    getChatStore().setMessagePinned(chatId, messageId, pinnedAt);
  });

  // Голоса в опросе изменились — сервер шлёт полный снапшот votes
  socket.on('poll:updated', ({ chatId, messageId, votes }: WSServerEvents['poll:updated']) => {
    getChatStore().applyPollVotes(chatId, messageId, votes);
  });

  // Серверный sweeper удалил истёкшие по TTL сообщения
  socket.on('messages:expired', ({ chatId, messageIds }: WSServerEvents['messages:expired']) => {
    getChatStore().expireMessages(chatId, messageIds);
  });

  socket.on('user:status', ({ userId, status, lastSeenAt }: WSServerEvents['user:status']) => {
    useChatStore.setState((s) => ({
      chats: s.chats.map((chat) => ({
        ...chat,
        members: chat.members.map((m) =>
          m.userId === userId
            // lastSeenAt обновляем (чтобы «был в сети N назад» был точным); если
            // в событии его нет — сохраняем прежнее.
            ? { ...m, user: { ...m.user, status, lastSeenAt: lastSeenAt ?? m.user.lastSeenAt } }
            : m,
        ),
      })),
    }));
  });

  subscribeLifecycle();
  return socket;
}

/**
 * P2-16: Capacitor/PWA — при возврате из background сокет может быть в
 * disconnected состоянии (iOS «убил» webSocket чтобы сэкономить батарею).
 * Подписываемся на app:foreground/app:network и явно реконнектимся.
 * Idempotent через флаг.
 */
let lifecycleSubscribed = false;
function subscribeLifecycle(): void {
  if (lifecycleSubscribed) return;
  lifecycleSubscribed = true;
  const tryReconnect = () => {
    if (socket && !socket.connected) {
      try { socket.connect(); } catch { /* ignore */ }
    }
  };
  window.addEventListener('app:foreground', tryReconnect);
  window.addEventListener('app:network', (e: Event) => {
    const detail = (e as CustomEvent).detail as { connected?: boolean } | undefined;
    if (detail?.connected) tryReconnect();
  });
}

/**
 * Полностью отключает сокет И очищает все state'ы, которые могут утечь
 * между сессиями: outbox-сообщения, ack-таймеры, флаг initial-connect.
 * Должен вызываться из ВСЕХ путей logout'а (P1-17 в WEB_AUDIT_2026-06-10.md).
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  // Снимаем висящие ack-таймауты, чтобы они не сработали уже под новым юзером.
  for (const t of pendingAcks.values()) clearTimeout(t);
  pendingAcks.clear();
  // Outbox: при resync новой сессии мы бы переотправили эти сообщения от
  // имени НОВОГО юзера — это утечка данных предыдущего юзера. Чистим.
  pendingOutbox.clear();
  // Сбрасываем флаг — следующий connect для новой сессии не должен запускать
  // resync со стейтом предыдущей.
  hadInitialConnectEver = false;
}

/**
 * Отправка сообщения с idempotency-id и ack-таймаутом.
 *  • Генерим clientMsgId — бэк по нему дедупает повторы при reconnect.
 *  • Если за 8 сек не пришло `message:new` с тем же clientMsgId — считаем
 *    "недоставленным" и показываем тост. Сама очередь socket.io пробует
 *    переотправить автоматически после reconnect, но без ack уверенности нет.
 */
export function sendMessage(payload: SendMessagePayload & { clientMsgId?: string }): string {
  const clientMsgId = payload.clientMsgId ?? crypto.randomUUID();
  const final = { ...payload, clientMsgId };

  if (!socket?.connected) {
    // Бэк недоступен — кладём в outbox; при reconnect-resync переотправим
    pendingOutbox.set(clientMsgId, final);
    toast.error('Нет соединения. Сообщение отправится при восстановлении.');
    return clientMsgId;
  }

  pendingOutbox.set(clientMsgId, final);
  scheduleAckTimeout(clientMsgId);
  socket.emit('message:send', final);
  return clientMsgId;
}

/** Перезапускает ack-таймер для сообщения. Без этого outbox-resend на reconnect
 *  отправляет сообщение, но не контролирует время доставки — юзер не узнает,
 *  если повтор тоже зафейлился. */
function scheduleAckTimeout(clientMsgId: string): void {
  const prev = pendingAcks.get(clientMsgId);
  if (prev) clearTimeout(prev);
  pendingAcks.set(clientMsgId, setTimeout(() => {
    if (pendingAcks.has(clientMsgId)) {
      pendingAcks.delete(clientMsgId);
      // Сообщение остаётся в outbox — следующий reconnect переотправит.
      toast.error('Сообщение не доставлено. Повторим при восстановлении.');
    }
  }, 8000));
}

// Outbox для сообщений отправленных до коннекта / при таймауте ack.
const pendingOutbox = new Map<string, SendMessagePayload & { clientMsgId: string }>();
const pendingAcks = new Map<string, ReturnType<typeof setTimeout>>();

/** Помечаем сообщение как доставленное (вызывается из message:new handler). */
function ackMessage(clientMsgId: string): void {
  const t = pendingAcks.get(clientMsgId);
  if (t) clearTimeout(t);
  pendingAcks.delete(clientMsgId);
  pendingOutbox.delete(clientMsgId);
}

/** Полный resync после reconnect:
 *  • перезагружает список чатов (новые/удалённые/изменения)
 *  • перезагружает сообщения активного чата (то что пропустили)
 *  • переотправляет outbox-сообщения */
async function resyncAfterReconnect(): Promise<void> {
  try {
    const chatsRes = await api.get<{ success: boolean; data: Chat[] }>('/chats');
    useChatStore.setState({ chats: chatsRes.data.data });
  } catch { /* offline-ok */ }

  // Префетч сообщений активного чата СРАЗУ (юзер смотрит туда).
  // P1-12: mergeMessages вместо setMessages — пока летел запрос, через сокет
  // могли прийти live-сообщения. setMessages их затирал.
  const { activeChatId, messages, mergeMessages } = useChatStore.getState();
  if (activeChatId) {
    try {
      const msgsRes = await api.get<{ success: boolean; data: Message[] }>(`/chats/${activeChatId}/messages`);
      mergeMessages(activeChatId, msgsRes.data.data);
    } catch { /* offline-ok */ }
  }

  // Все остальные загруженные ранее чаты — refetch в фоне, без блокировки.
  // Без этого, если юзер уходил из чата X в чат Y во время offline,
  // в X останутся stale-сообщения и gap-indicator не покажется.
  const loadedChatIds = Object.keys(messages).filter((id) => id !== activeChatId);
  for (const chatId of loadedChatIds) {
    api.get<{ success: boolean; data: Message[] }>(`/chats/${chatId}/messages`)
      .then(({ data }) => mergeMessages(chatId, data.data ?? []))
      .catch(() => { /* offline-ok */ });
  }

  // Переотправляем outbox-сообщения с восстановлением ack-таймера.
  drainOutbox();
}

/** Шлёт все outbox-сообщения в текущий сокет с восстановлением ack-таймера. */
function drainOutbox(): void {
  if (!socket?.connected || pendingOutbox.size === 0) return;
  for (const [clientMsgId, msg] of pendingOutbox.entries()) {
    socket.emit('message:send', msg);
    scheduleAckTimeout(clientMsgId);
  }
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

/** Исчезающие сообщения: TTL чата (null — выключить). */
export function setChatTtl(chatId: string, seconds: number | null): void {
  socket?.emit('chat:set-ttl', { chatId, seconds });
}

/** Медленный режим: интервал между сообщениями для member'ов (null — выключить). */
export function setSlowMode(chatId: string, seconds: number | null): void {
  socket?.emit('chat:set-slowmode', { chatId, seconds });
}

export function pinMessage(chatId: string, messageId: string, pin: boolean): void {
  socket?.emit('message:pin', { chatId, messageId, pin });
}

export function votePoll(chatId: string, pollId: string, optionIds: string[]): void {
  socket?.emit('poll:vote', { chatId, pollId, optionIds });
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
    // Prefs: previews выключены — не раскрываем содержимое, имя отправителя оставляем
    const body = !getNotifPrefs().previews
      ? '🔔 Новое сообщение'
      :
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
