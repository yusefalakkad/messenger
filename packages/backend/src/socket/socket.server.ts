import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { config } from '../config';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../lib/prisma';
import { redis, setUserOnline, setUserOffline } from '../lib/redis';
import { logger } from '../lib/logger';
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

    socket.on('chat:join', ({ chatId }: WSClientEvents['chat:join']) => {
      socket.join(`chat:${chatId}`);
    });

    socket.on('chat:leave', ({ chatId }: WSClientEvents['chat:leave']) => {
      socket.leave(`chat:${chatId}`);
    });

    socket.on('message:send', async (payload: SendMessagePayload) => {
      try {
        await handleSendMessage(io, socket, payload);
      } catch (err) {
        socket.emit('error', { code: 'SEND_FAILED', message: 'Failed to send message' });
        logger.error('message:send error', { err });
      }
    });

    socket.on('message:read', async ({ messageId, chatId }: WSClientEvents['message:read']) => {
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

    socket.on('message:delete', async ({ messageId, chatId }: WSClientEvents['message:delete']) => {
      try {
        const message = await prisma.message.findFirst({ where: { id: messageId, senderId: userId } });
        if (!message) return;
        await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
        io.to(`chat:${chatId}`).emit('message:deleted', { messageId, chatId });
      } catch (err) {
        logger.error('message:delete error', { err });
      }
    });

    socket.on('message:react', async ({ messageId, chatId, emoji }: WSClientEvents['message:react']) => {
      try {
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
        io.to(`chat:${chatId}`).emit('message:reacted', { messageId, chatId, userId, emoji, action });
      } catch (err) {
        logger.error('message:react error', { err });
      }
    });

    socket.on('message:edit', async ({ messageId, chatId, content }: WSClientEvents['message:edit']) => {
      try {
        const message = await prisma.message.findFirst({ where: { id: messageId, senderId: userId, type: 'text' } });
        if (!message) return;
        const updated = await prisma.message.update({
          where: { id: messageId },
          data: { content, editedAt: new Date() },
        });
        io.to(`chat:${chatId}`).emit('message:updated', { id: messageId, content, editedAt: updated.editedAt });
      } catch (err) {
        logger.error('message:edit error', { err });
      }
    });

    // ─── Calls (WebRTC signaling relay) ──────────────────────────────────────

    socket.on('call:initiate', async ({ callId, peerId, chatId, callType }: WSClientEvents['call:initiate']) => {
      // Проверяем, что оба — участники чата
      const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } });
      if (!member) return;

      // Вступаем в комнату звонка
      socket.join(`call:${callId}`);

      // Получаем имя звонящего для отображения
      const caller = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, avatar: true } });

      // Отправляем входящий звонок
      io.to(`user:${peerId}`).emit('call:incoming', {
        callId,
        callerId: userId,
        callerName: caller?.displayName ?? socket.username,
        callerAvatar: caller?.avatar ?? undefined,
        chatId,
        callType,
      });
    });

    socket.on('call:accept', ({ callId }: WSClientEvents['call:accept']) => {
      socket.join(`call:${callId}`);
      socket.to(`call:${callId}`).emit('call:accepted', { callId, peerId: userId });
    });

    socket.on('call:reject', ({ callId }: WSClientEvents['call:reject']) => {
      io.to(`call:${callId}`).emit('call:ended', { callId, reason: 'rejected' });
      socket.leave(`call:${callId}`);
    });

    socket.on('call:end', ({ callId }: WSClientEvents['call:end']) => {
      io.to(`call:${callId}`).emit('call:ended', { callId, reason: 'ended' });
      socket.leave(`call:${callId}`);
    });

    socket.on('call:signal', ({ callId, signal }: WSClientEvents['call:signal']) => {
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

  // Verify membership
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId: payload.chatId, userId } },
  });
  if (!member) throw new Error('Not a member');

  const message = await prisma.message.create({
    data: {
      chatId: payload.chatId,
      senderId: userId,
      type: payload.type,
      content: payload.content,
      encrypted: payload.encrypted ?? false,
      nonce:     payload.nonce,
      replyToId: payload.replyToId,
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
}

async function handleMessageRead(
  io: SocketServer,
  socket: Socket,
  messageId: string,
  chatId: string,
): Promise<void> {
  const { userId } = socket;

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
