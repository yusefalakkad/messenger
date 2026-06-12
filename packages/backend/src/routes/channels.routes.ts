import { Router, Request, Response, NextFunction } from 'express';
import { Server as SocketServer } from 'socket.io';
import { param, query } from 'express-validator';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { sendSuccess, AppError } from '../utils/response';
import { signMediaUrlsDeep } from '../lib/mediaUrl';
import { stripInviteCode } from './chat.routes';

// Каналы: подписка, поиск публичных, вход по invite-ссылке.
// Монтируется в index.ts на корень — пути здесь полные (/channels/*, /join/:code).
const router = Router();

/**
 * Общая логика подписки: upsert ChatMember (re-join обнуляет leftAt),
 * socketsJoin в комнату чата, личный chat:new — порядок как в POST /chats/group
 * (сначала join, потом emit, иначе первое сообщение потеряется).
 * Возвращает чат без inviteCode.
 */
async function subscribeUserToChat(req: Request, chatId: string, userId: string) {
  await prisma.chatMember.upsert({
    where: { chatId_userId: { chatId, userId } },
    update: { leftAt: null },
    create: { chatId, userId, role: 'member' },
  });

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      members: {
        where: { leftAt: null },
        include: { user: { select: { id: true, username: true, displayName: true, avatar: true, publicKey: true } } },
      },
    },
  });
  if (!chat) throw new AppError(404, 'NOT_FOUND', 'Chat not found');

  const safeChat = stripInviteCode(chat);
  const io = req.app.get('io') as SocketServer | undefined;
  if (io) {
    await io.in(`user:${userId}`).socketsJoin(`chat:${chatId}`);
    io.to(`user:${userId}`).emit('chat:new', signMediaUrlsDeep({ ...safeChat, unreadCount: 0, unreadMentions: 0, lastMessage: null }));
  }
  return safeChat;
}

// GET /channels/search?q= — поиск публичных каналов И групп (username != null)
router.get('/channels/search',
  requireAuth,
  validate([query('q').isString().trim().isLength({ min: 1, max: 64 })]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const q = (req.query.q as string).trim();

      const channels = await prisma.chat.findMany({
        where: {
          type: { in: ['channel', 'group'] },
          username: { not: null },
          OR: [
            { name:     { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 20,
        select: {
          id: true, type: true, name: true, username: true, avatar: true, description: true,
          // Подписчики — только активные members
          _count:  { select: { members: { where: { leftAt: null } } } },
          members: { where: { userId, leftAt: null }, select: { userId: true } },
        },
      });

      const result = channels.map((c) => ({
        id:              c.id,
        type:            c.type,
        name:            c.name,
        username:        c.username,
        avatar:          c.avatar,
        description:     c.description,
        subscriberCount: c._count.members,
        isMember:        c.members.length > 0,
      }));

      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// POST /channels/:chatId/subscribe — подписаться на публичный канал или группу
router.post('/channels/:chatId/subscribe',
  requireAuth,
  validate([param('chatId').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;

      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { type: true, username: true },
      });
      if (!chat || (chat.type !== 'channel' && chat.type !== 'group')) {
        throw new AppError(404, 'NOT_FOUND', 'Channel not found');
      }
      // Приватный (без username) — вход только по invite-ссылке
      if (!chat.username) throw new AppError(403, 'CHANNEL_PRIVATE', 'Chat is private');

      const result = await subscribeUserToChat(req, chatId, userId);
      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// POST /join/:code — вход по invite-ссылке (канал или группа)
router.post('/join/:code',
  requireAuth,
  validate([param('code').isString().isLength({ min: 8, max: 64 })]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { code } = req.params;

      const chat = await prisma.chat.findUnique({
        where: { inviteCode: code },
        select: { id: true, type: true },
      });
      if (!chat || (chat.type !== 'channel' && chat.type !== 'group')) {
        throw new AppError(404, 'INVALID_INVITE', 'Invalid invite link');
      }

      const result = await subscribeUserToChat(req, chat.id, userId);
      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

export default router;
