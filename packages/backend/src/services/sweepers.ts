/**
 * Фоновые свиперы:
 *  - авто-удаление истёкших сообщений (chat.messageTtlSeconds → Message.expiresAt)
 *  - отправка отложенных сообщений (ScheduledMessage.sendAt)
 *
 * Запускается из index.ts после старта io: initSweepers(io).
 * Ошибки — logger.warn, свиперы не падают.
 */
import { Server as SocketServer } from 'socket.io';
import type { MessageType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { signMediaUrlsDeep } from '../lib/mediaUrl';

const EXPIRED_INTERVAL_MS = 60_000;
const SCHEDULED_INTERVAL_MS = 15_000;

// Include как в message:send — чтобы message:new от свипера был неотличим от обычного
const MESSAGE_INCLUDE = {
  sender:    { select: { id: true, username: true, displayName: true, avatar: true, publicKey: true } },
  media:     true,
  reads:     { select: { userId: true, readAt: true } },
  reactions: { select: { userId: true, emoji: true } },
  poll:      { include: { votes: { select: { optionId: true, userId: true } } } },
  replyTo: {
    select: {
      id: true, type: true, content: true, senderId: true,
      encrypted: true, nonce: true,
      sender: { select: { displayName: true } },
      media: { select: { url: true, thumbnailUrl: true, mimeType: true } },
    },
  },
} as const;

export function initSweepers(io: SocketServer): void {
  setInterval(() => { void sweepExpiredMessages(io); }, EXPIRED_INTERVAL_MS);
  setInterval(() => { void sweepScheduledMessages(io); }, SCHEDULED_INTERVAL_MS);
  logger.info('Sweepers started (expired: 60s, scheduled: 15s)');
}

// ─── Истёкшие сообщения (TTL) ─────────────────────────────────────────────────

async function sweepExpiredMessages(io: SocketServer): Promise<void> {
  try {
    const now = new Date();
    const expired = await prisma.message.findMany({
      where: { expiresAt: { lte: now }, deletedAt: null },
      select: { id: true, chatId: true },
      take: 1000,
    });
    if (expired.length === 0) return;

    await prisma.message.updateMany({
      where: { id: { in: expired.map((m) => m.id) } },
      data: { deletedAt: now },
    });

    // Группируем по чату и уведомляем комнаты
    const byChat = new Map<string, string[]>();
    for (const m of expired) {
      const list = byChat.get(m.chatId) ?? [];
      list.push(m.id);
      byChat.set(m.chatId, list);
    }
    for (const [chatId, messageIds] of byChat) {
      io.to(`chat:${chatId}`).emit('messages:expired', { chatId, messageIds });
    }
  } catch (err) {
    logger.warn('expired-messages sweeper failed', { err: (err as Error).message });
  }
}

// ─── Отложенные сообщения ─────────────────────────────────────────────────────

async function sweepScheduledMessages(io: SocketServer): Promise<void> {
  try {
    const due = await prisma.scheduledMessage.findMany({
      where: { sendAt: { lte: new Date() } },
      orderBy: { sendAt: 'asc' },
      take: 100,
    });

    for (const sched of due) {
      try {
        // Автор мог выйти из чата после планирования — тогда просто удаляем
        const member = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId: sched.chatId, userId: sched.userId } },
          include: { chat: { select: { messageTtlSeconds: true } } },
        });
        if (!member || member.leftAt) {
          await prisma.scheduledMessage.delete({ where: { id: sched.id } });
          logger.warn('scheduled sweeper: author left chat, dropping', { id: sched.id });
          continue;
        }

        // TTL чата → expiresAt, как в message:send
        const ttl = member.chat.messageTtlSeconds;
        const expiresAt = ttl ? new Date(Date.now() + ttl * 1000) : undefined;

        const message = await prisma.$transaction(async (tx) => {
          const msg = await tx.message.create({
            data: {
              chatId:   sched.chatId,
              senderId: sched.userId,
              // ScheduledMessage.type — String в схеме; создаём только 'text' (валидация в роуте)
              type:     sched.type as MessageType,
              content:  sched.content,
              expiresAt,
            },
            include: MESSAGE_INCLUDE,
          });
          // bump updatedAt — сортировка списка чатов
          await tx.chat.update({ where: { id: sched.chatId }, data: { updatedAt: new Date() } });
          await tx.scheduledMessage.delete({ where: { id: sched.id } });
          return msg;
        });

        io.to(`chat:${sched.chatId}`).emit('message:new', signMediaUrlsDeep({ ...message }));
      } catch (err) {
        logger.warn('scheduled sweeper: send failed', { id: sched.id, err: (err as Error).message });
      }
    }
  } catch (err) {
    logger.warn('scheduled sweeper failed', { err: (err as Error).message });
  }
}
