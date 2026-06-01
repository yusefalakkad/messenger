import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { config } from '../config';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../lib/prisma';
import { redis, setUserOnline, setUserOffline, isUserOnline } from '../lib/redis';
import { sendPushToUser } from '../lib/push';
import { sendNativePushToUser, sendVoIPCallPush } from '../lib/push-native';
import { logger } from '../lib/logger';
import { extractObjectName } from '../lib/minio';
import type { WSClientEvents, WSServerEvents, SendMessagePayload } from '@messenger/shared';

declare module 'socket.io' {
  interface Socket {
    userId: string;
    username: string;
  }
}

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: config.server.clientUrl,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ─── Authentication middleware ──────────────────────────────────────────────

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('UNAUTHORIZED'));
    try {
      const payload = verifyAccessToken(token);
      socket.userId = payload.sub;
      socket.username = payload.username;
      next();
    } catch {
      next(new Error('TOKEN_INVALID'));
    }
  });

  // ─── Connection ─────────────────────────────────────────────────────────────

  io.on('connection', async (socket) => {
    const { userId } = socket;
    logger.debug(`Socket connected: ${userId} (${socket.id})`);

    // Per-socket in-memory token bucket.
    // event → массив timestamps попыток за последнее окно.
    const buckets = new Map<string, number[]>();
    const checkRate = (event: string, max: number, windowMs: number): boolean => {
      const now = Date.now();
      const arr = (buckets.get(event) ?? []).filter((t) => now - t < windowMs);
      if (arr.length >= max) {
        buckets.set(event, arr);
        return false;
      }
      arr.push(now);
      buckets.set(event, arr);
      return true;
    };

    // Mark user online
    await setUserOnline(userId, socket.id);
    await prisma.user.update({ where: { id: userId }, data: { status: 'online' } });

    // Личная комната пользователя (для системных событий: новый чат и т.д.)
    socket.join(`user:${userId}`);

    // Join all chat rooms this user belongs to
    const memberships = await prisma.chatMember.findMany({
      where: { userId, leftAt: null },
      select: { chatId: true },
    });
    memberships.forEach(({ chatId }) => socket.join(`chat:${chatId}`));

    // Broadcast online status to contacts
    broadcastUserStatus(io, userId, 'online');

    // ─── Events ─────────────────────────────────────────────────────────────

    socket.on('chat:join', async ({ chatId }: WSClientEvents['chat:join']) => {
      // SECURITY: только участник чата может слушать его room.
      // Без проверки любой авторизованный юзер мог бы подслушивать чужие чаты.
      if (!chatId || typeof chatId !== 'string') return;
      try {
        const member = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId, userId } },
          select: { leftAt: true },
        });
        if (!member || member.leftAt) {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not a member of this chat' });
          return;
        }
        socket.join(`chat:${chatId}`);
      } catch (err) {
        logger.error('chat:join check failed', { err: (err as Error).message, chatId, userId });
      }
    });

    socket.on('chat:leave', ({ chatId }: WSClientEvents['chat:leave']) => {
      if (!chatId || typeof chatId !== 'string') return;
      socket.leave(`chat:${chatId}`);
    });

    socket.on('message:send', async (payload: SendMessagePayload) => {
      if (!checkRate('message:send', 30, 10_000)) {
        socket.emit('error', { code: 'RATE_LIMIT', message: 'Slow down — too many messages' });
        return;
      }
      try {
        await handleSendMessage(io, socket, payload);
      } catch (err) {
        socket.emit('error', { code: 'SEND_FAILED', message: 'Failed to send message' });
        logger.error('message:send error', { err });
      }
    });

    socket.on('message:read', async ({ messageId, chatId }: WSClientEvents['message:read']) => {
      // Защита от спама read-ивентов (накачка БД + флуд broadcast'ов)
      if (!checkRate('message:read', 100, 10_000)) return;
      try {
        await handleMessageRead(io, socket, messageId, chatId);
      } catch (err) {
        logger.error('message:read error', { err });
      }
    });

    socket.on('message:typing', ({ chatId, isTyping }: WSClientEvents['message:typing']) => {
      socket.to(`chat:${chatId}`).emit('user:typing', {
        chatId,
        userId,
        isTyping,
      });
    });

    socket.on('message:delete', async ({ messageId }: WSClientEvents['message:delete']) => {
      try {
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { id: true, chatId: true, senderId: true, deletedAt: true },
        });
        if (!message || message.deletedAt) return;

        // Проверяем членство пользователя в чате (chatId берём из БД, не от клиента).
        const member = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId: message.chatId, userId } },
          select: { role: true, leftAt: true },
        });
        if (!member || member.leftAt) return;

        // Удалить может: автор сообщения или владелец/админ чата.
        const canDelete =
          message.senderId === userId ||
          member.role === 'owner' ||
          member.role === 'admin';
        if (!canDelete) return;

        await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
        io.to(`chat:${message.chatId}`).emit('message:deleted', { messageId, chatId: message.chatId });
      } catch (err) {
        logger.error('message:delete error', { err });
      }
    });

    socket.on('message:react', async ({ messageId, emoji }: WSClientEvents['message:react']) => {
      try {
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { chatId: true },
        });
        if (!message) return;

        const member = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId: message.chatId, userId } },
          select: { id: true, leftAt: true },
        });
        if (!member || member.leftAt) return;

        const existing = await prisma.reaction.findUnique({
          where: { messageId_userId_emoji: { messageId, userId, emoji } },
        });
        let action: 'add' | 'remove';
        if (existing) {
          await prisma.reaction.delete({ where: { id: existing.id } });
          action = 'remove';
        } else {
          await prisma.reaction.create({ data: { messageId, userId, emoji } });
          action = 'add';
        }
        io.to(`chat:${message.chatId}`).emit('message:reacted', { messageId, chatId: message.chatId, userId, emoji, action });
      } catch (err) {
        logger.error('message:react error', { err });
      }
    });

    socket.on('message:edit', async ({ messageId, content }: WSClientEvents['message:edit']) => {
      try {
        // Редактировать может только автор. type=text для защиты от правки медиа-капшнов.
        const message = await prisma.message.findFirst({
          where: { id: messageId, senderId: userId, type: 'text', deletedAt: null },
          select: { id: true, chatId: true },
        });
        if (!message) return;
        if (typeof content !== 'string' || content.length === 0 || content.length > 10_000) return;

        const updated = await prisma.message.update({
          where: { id: messageId },
          data: { content, editedAt: new Date() },
        });
        io.to(`chat:${message.chatId}`).emit('message:updated', {
          id: messageId,
          content,
          editedAt: updated.editedAt,
          chatId: message.chatId,
        });
      } catch (err) {
        logger.error('message:edit error', { err });
      }
    });

    // ─── Calls (WebRTC signaling relay) ──────────────────────────────────────

    // SECURITY: Redis-set участников звонка — без него любой авторизованный
    // юзер мог join'нуть call:<callId> и подслушивать SDP / завершать звонок.
    // Ключ TTL 1 час — сам по себе чистится если звонок не завершён аккуратно.
    const CALL_PEERS_KEY  = (callId: string) => `call:${callId}:peers`;
    const CALL_META_KEY   = (callId: string) => `call:${callId}:meta`;
    const CALL_TTL_SEC    = 3600;

    const isCallParticipant = async (callId: string): Promise<boolean> => {
      if (typeof callId !== 'string' || callId.length === 0 || callId.length > 64) return false;
      const ok = await redis.sismember(CALL_PEERS_KEY(callId), userId);
      return ok === 1;
    };

    socket.on('call:initiate', async ({ callId, peerId, chatId, callType }: WSClientEvents['call:initiate']) => {
      if (!checkRate('call:initiate', 5, 60_000)) {
        socket.emit('error', { code: 'RATE_LIMIT', message: 'Too many call attempts' });
        return;
      }
      // Базовая валидация
      if (typeof callId !== 'string' || callId.length === 0 || callId.length > 64) return;
      if (typeof peerId !== 'string' || typeof chatId !== 'string') return;

      // Оба должны быть участниками чата
      const [meMember, peerMember] = await Promise.all([
        prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } }, select: { id: true } }),
        prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: peerId } }, select: { id: true } }),
      ]);
      if (!meMember || !peerMember) {
        socket.emit('error', { code: 'CALL_FORBIDDEN', message: 'Both users must be in the chat' });
        return;
      }

      // Регистрируем участников звонка в Redis (TTL 1ч)
      await redis.sadd(CALL_PEERS_KEY(callId), userId, peerId);
      await redis.expire(CALL_PEERS_KEY(callId), CALL_TTL_SEC);
      await redis.set(CALL_META_KEY(callId), JSON.stringify({ chatId, initiator: userId }), 'EX', CALL_TTL_SEC);

      socket.join(`call:${callId}`);

      const caller = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, avatar: true } });

      io.to(`user:${peerId}`).emit('call:incoming', {
        callId,
        callerId: userId,
        callerName: caller?.displayName ?? socket.username,
        callerAvatar: caller?.avatar ?? undefined,
        chatId,
        callType,
      });

      void sendVoIPCallPush(peerId, {
        callId,
        chatId,
        callerId: userId,
        callerName: caller?.displayName ?? socket.username,
        callerAvatar: caller?.avatar ?? undefined,
        callType,
      });
    });

    socket.on('call:accept', async ({ callId }: WSClientEvents['call:accept']) => {
      if (!(await isCallParticipant(callId))) return;
      socket.join(`call:${callId}`);
      socket.to(`call:${callId}`).emit('call:accepted', { callId, peerId: userId });
    });

    socket.on('call:reject', async ({ callId }: WSClientEvents['call:reject']) => {
      if (!(await isCallParticipant(callId))) return;
      io.to(`call:${callId}`).emit('call:ended', { callId, reason: 'rejected' });
      await redis.del(CALL_PEERS_KEY(callId), CALL_META_KEY(callId));
      socket.leave(`call:${callId}`);
    });

    socket.on('call:end', async ({ callId }: WSClientEvents['call:end']) => {
      if (!(await isCallParticipant(callId))) return;
      io.to(`call:${callId}`).emit('call:ended', { callId, reason: 'ended' });
      await redis.del(CALL_PEERS_KEY(callId), CALL_META_KEY(callId));
      socket.leave(`call:${callId}`);
    });

    socket.on('call:signal', async ({ callId, signal }: WSClientEvents['call:signal']) => {
      if (!(await isCallParticipant(callId))) return;
      socket.to(`call:${callId}`).emit('call:signal', { callId, signal });
    });

    // ─── Disconnect ───────────────────────────────────────────────────────────

    socket.on('disconnect', async () => {
      logger.debug(`Socket disconnected: ${userId} (${socket.id})`);
      await setUserOffline(userId, socket.id);

      // Check if user has other active sockets
      const isStillOnline = (await redis.scard(`socket:user:${userId}`)) > 0;
      if (!isStillOnline) {
        const lastSeenAt = new Date();
        await prisma.user.update({
          where: { id: userId },
          data: { status: 'offline', lastSeenAt },
        });
        broadcastUserStatus(io, userId, 'offline', lastSeenAt);
      }
    });
  });

  return io;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleSendMessage(
  io: SocketServer,
  socket: Socket,
  payload: SendMessagePayload,
): Promise<void> {
  const { userId } = socket;

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!payload || typeof payload !== 'object') {
    socket.emit('error', { code: 'BAD_PAYLOAD', message: 'Invalid payload' });
    return;
  }
  if (typeof payload.chatId !== 'string' || payload.chatId.length === 0 || payload.chatId.length > 64) {
    socket.emit('error', { code: 'BAD_CHAT_ID' });
    return;
  }
  const ALLOWED_TYPES = new Set(['text', 'image', 'video', 'voice', 'circle', 'file']);
  if (typeof payload.type !== 'string' || !ALLOWED_TYPES.has(payload.type)) {
    socket.emit('error', { code: 'BAD_TYPE', message: 'Type not allowed' });
    return;
  }
  if (payload.content != null) {
    if (typeof payload.content !== 'string' || payload.content.length > 10_000) {
      socket.emit('error', { code: 'CONTENT_TOO_LONG' });
      return;
    }
  }
  if (payload.nonce != null && (typeof payload.nonce !== 'string' || payload.nonce.length > 128)) {
    socket.emit('error', { code: 'BAD_NONCE' });
    return;
  }
  if (payload.replyToId != null && (typeof payload.replyToId !== 'string' || payload.replyToId.length > 64)) {
    socket.emit('error', { code: 'BAD_REPLY_ID' });
    return;
  }
  if (payload.forwardedFromId != null && (typeof payload.forwardedFromId !== 'string' || payload.forwardedFromId.length > 64)) {
    socket.emit('error', { code: 'BAD_FORWARD_ID' });
    return;
  }
  if (payload.mediaData?.size != null
      && (typeof payload.mediaData.size !== 'number' || payload.mediaData.size < 0 || payload.mediaData.size > 200 * 1024 * 1024)) {
    socket.emit('error', { code: 'MEDIA_TOO_LARGE' });
    return;
  }

  // Verify membership
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId: payload.chatId, userId } },
  });
  if (!member) throw new Error('Not a member');

  // SECURITY: replyToId должен указывать на сообщение из того же чата
  if (payload.replyToId) {
    const replyTarget = await prisma.message.findUnique({
      where: { id: payload.replyToId },
      select: { chatId: true },
    });
    if (!replyTarget || replyTarget.chatId !== payload.chatId) {
      socket.emit('error', { code: 'BAD_REPLY_TARGET', message: 'Reply target not in this chat' });
      return;
    }
  }

  // Block check: если получатель в директе заблокировал отправителя — отказ
  if (await isBlockedDirect(payload.chatId, userId)) {
    socket.emit('error', { code: 'BLOCKED', message: 'You are blocked by this user' });
    return;
  }

  // SECURITY: валидация mediaData.url — пользователь может прикрепить ТОЛЬКО
  // объект, который сам загрузил (путь начинается с <type>/<userId>/).
  // Без этой проверки можно прикреплять чужие медиа к своим сообщениям и через
  // membership-проверку в GET /media/:object получать доступ к чужим файлам.
  if (payload.mediaData) {
    const ownershipOk = isMediaOwnedByUser(payload.mediaData, payload.type, userId);
    if (!ownershipOk) {
      socket.emit('error', { code: 'MEDIA_FORBIDDEN', message: 'Media URL does not belong to you' });
      return;
    }
  }

  // Forward: проверяем доступ к источнику
  if (payload.forwardedFromId) {
    const sourceMessage = await prisma.message.findUnique({
      where: { id: payload.forwardedFromId },
      select: { chatId: true },
    });
    if (!sourceMessage) {
      socket.emit('error', { code: 'FORWARD_SOURCE_MISSING', message: 'Source message not found' });
      return;
    }
    const sourceMember = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: sourceMessage.chatId, userId } },
      select: { id: true },
    });
    if (!sourceMember) {
      socket.emit('error', { code: 'FORWARD_NO_ACCESS', message: 'No access to source message' });
      return;
    }
  }

  const message = await prisma.message.create({
    data: {
      chatId: payload.chatId,
      senderId: userId,
      type: payload.type,
      content: payload.content,
      encrypted: payload.encrypted ?? false,
      nonce:     payload.nonce,
      replyToId: payload.replyToId,
      forwardedFromId: payload.forwardedFromId,
      ...(payload.mediaData
        ? {
            media: {
              create: {
                url:          payload.mediaData.url,
                thumbnailUrl: payload.mediaData.thumbnailUrl,
                mimeType:     payload.mediaData.mimeType,
                size:         payload.mediaData.size,
                width:        payload.mediaData.width,
                height:       payload.mediaData.height,
                duration:     payload.mediaData.duration,
                waveform:     payload.mediaData.waveform ?? undefined,
              },
            },
          }
        : {}),
    },
    include: {
      sender:    { select: { id: true, username: true, displayName: true, avatar: true, publicKey: true } },
      media:     true,
      reads:     { select: { userId: true, readAt: true } },
      reactions: { select: { userId: true, emoji: true } },
      replyTo: { select: { id: true, type: true, content: true, senderId: true, sender: { select: { displayName: true } } } },
    },
  });

  // Update chat's updatedAt for ordering
  await prisma.chat.update({
    where: { id: payload.chatId },
    data: { updatedAt: new Date() },
  });

  io.to(`chat:${payload.chatId}`).emit('message:new', message);

  // Push офлайн-членам чата (кроме отправителя)
  void notifyOfflineMembers(payload.chatId, userId, message);
}

// Sealed-sender-lite: пуш не содержит ни имени отправителя, ни превью текста.
// Только chatId — клиент сам подтянет содержимое после открытия.
// Снижает утечку метаданных через push-провайдеров и историю уведомлений ОС.
async function notifyOfflineMembers(
  chatId: string,
  senderId: string,
  _message: { id: string; type: string; content: string | null; encrypted: boolean },
): Promise<void> {
  try {
    const members = await prisma.chatMember.findMany({
      where: { chatId, userId: { not: senderId }, leftAt: null },
      select: { userId: true, mutedUntil: true },
    });

    const now = new Date();
    await Promise.all(members.map(async (m) => {
      // Чат заглушён — не шлём push
      if (m.mutedUntil && m.mutedUntil > now) return;
      if (await isUserOnline(m.userId)) return;
      const payload = { title: 'Новое сообщение', body: '', chatId };
      // Параллельно: web-push (VAPID) + native (APNs/FCM)
      await Promise.all([
        sendPushToUser(m.userId, payload),
        sendNativePushToUser(m.userId, payload),
      ]);
    }));
  } catch (err) {
    logger.warn('push fanout failed', { err });
  }
}

async function handleMessageRead(
  io: SocketServer,
  socket: Socket,
  messageId: string,
  chatId: string,
): Promise<void> {
  const { userId } = socket;

  // Базовая валидация
  if (typeof messageId !== 'string' || typeof chatId !== 'string'
      || messageId.length > 64 || chatId.length > 64) return;

  // SECURITY: проверяем что:
  //  1) юзер действительно состоит в этом чате
  //  2) messageId принадлежит этому чату (не подделка из чужого чата)
  const [member, message] = await Promise.all([
    prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
      select: { leftAt: true },
    }),
    prisma.message.findUnique({
      where: { id: messageId },
      select: { chatId: true },
    }),
  ]);
  if (!member || member.leftAt) return;
  if (!message || message.chatId !== chatId) return;

  await prisma.messageRead.upsert({
    where: { messageId_userId: { messageId, userId } },
    update: {},
    create: { messageId, userId },
  });

  io.to(`chat:${chatId}`).emit('message:read', {
    messageId,
    chatId,
    userId,
    readAt: new Date(),
  });
}

// Если чат direct — возвращает true, когда получатель заблокировал отправителя.
// Для group/channel всегда false.
async function isBlockedDirect(chatId: string, senderId: string): Promise<boolean> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { type: true, members: { where: { leftAt: null }, select: { userId: true } } },
  });
  if (!chat || chat.type !== 'direct') return false;

  const otherUserId = chat.members.find((m) => m.userId !== senderId)?.userId;
  if (!otherUserId) return false;

  const contact = await prisma.contact.findUnique({
    where: { ownerId_targetId: { ownerId: otherUserId, targetId: senderId } },
    select: { blocked: true },
  });
  return !!contact?.blocked;
}

async function broadcastUserStatus(
  io: SocketServer,
  userId: string,
  status: 'online' | 'offline',
  lastSeenAt?: Date,
): Promise<void> {
  // Find all chats this user is in and notify members
  const memberships = await prisma.chatMember.findMany({
    where: { userId, leftAt: null },
    select: { chatId: true },
  });
  memberships.forEach(({ chatId }) => {
    io.to(`chat:${chatId}`).emit('user:status', { userId, status, lastSeenAt });
  });
}

/**
 * Проверяет что URL (и опционально thumbnailUrl) в payload.mediaData принадлежат
 * текущему юзеру: путь объекта в MinIO должен иметь префикс `<type>/<userId>/`.
 *
 * Без этой проверки можно прикреплять чужие объекты (получая через них доступ
 * к чужим медиа в `GET /api/media/...`).
 */
function isMediaOwnedByUser(
  mediaData: { url?: string; thumbnailUrl?: string | null } | null | undefined,
  messageType: string,
  userId: string,
): boolean {
  if (!mediaData?.url || typeof mediaData.url !== 'string') return false;

  const allowedPrefixes = expectedPrefixesFor(messageType, userId);
  if (!check(mediaData.url, allowedPrefixes)) return false;
  if (mediaData.thumbnailUrl && !check(mediaData.thumbnailUrl, allowedPrefixes)) return false;
  return true;

  function check(url: string, prefixes: string[]): boolean {
    const obj = extractObjectName(url);
    if (!obj) return false;
    if (obj.includes('..') || obj.startsWith('/')) return false;
    return prefixes.some((p) => obj.startsWith(p));
  }

  function expectedPrefixesFor(type: string, uid: string): string[] {
    switch (type) {
      case 'image':  return [`image/${uid}/`];
      case 'video':  return [`video/${uid}/`];
      case 'voice':  return [`voice/${uid}/`];
      case 'circle': return [`circle/${uid}/`, `video/${uid}/`]; // circle хранится как video в зависимости от платформы
      case 'file':   return [`file/${uid}/`];
      default:       return []; // text/system не должны иметь mediaData
    }
  }
}
