import { Router, Request, Response, NextFunction } from 'express';
import { Server as SocketServer } from 'socket.io';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { sendSuccess, AppError } from '../utils/response';

const router = Router();

// GET /chats — list user's chats
router.get('/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const chats = await prisma.chat.findMany({
        where: {
          members: { some: { userId, leftAt: null } },
        },
        include: {
          members: {
            where: { leftAt: null },
            include: { user: { select: { id: true, username: true, displayName: true, avatar: true, status: true, publicKey: true } } },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { sender: { select: { id: true, displayName: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      // Attach unread count per chat
      const result = await Promise.all(chats.map(async (chat) => {
        const unreadCount = await prisma.message.count({
          where: {
            chatId: chat.id,
            deletedAt: null,
            senderId: { not: userId },
            reads: { none: { userId } },
          },
        });
        return { ...chat, unreadCount };
      }));

      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// POST /chats/direct — start a direct message chat
router.post('/direct',
  requireAuth,
  validate([body('targetUserId').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { targetUserId } = req.body;

      if (userId === targetUserId) throw new AppError(400, 'SAME_USER', 'Cannot create chat with yourself');

      // Check if direct chat already exists
      const existing = await prisma.chat.findFirst({
        where: {
          type: 'direct',
          members: { every: { userId: { in: [userId, targetUserId] }, leftAt: null } },
        },
        include: {
          members: {
            include: { user: { select: { id: true, username: true, displayName: true, avatar: true } } },
          },
        },
      });

      if (existing) { sendSuccess(res, existing); return; }

      // Verify target user exists
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId, deletedAt: null },
        select: { id: true, publicKey: true },
      });
      if (!targetUser) throw new AppError(404, 'USER_NOT_FOUND', 'Target user not found');

      const chat = await prisma.chat.create({
        data: {
          type: 'direct',
          createdById: userId,
          members: {
            create: [
              { userId, role: 'member' },
              { userId: targetUserId, role: 'member' },
            ],
          },
        },
        include: {
          members: {
            include: { user: { select: { id: true, username: true, displayName: true, avatar: true, publicKey: true } } },
          },
        },
      });

      // Уведомляем обоих участников о новом чате через их личные комнаты
      const io = req.app.get('io') as SocketServer;
      if (io) {
        const chatWithMeta = { ...chat, unreadCount: 0, lastMessage: null };
        [userId, targetUserId].forEach((uid) => {
          io.to(`user:${uid}`).emit('chat:new', chatWithMeta);
          // Добавляем участников в комнату чата
          io.in(`user:${uid}`).socketsJoin(`chat:${chat.id}`);
        });
      }

      sendSuccess(res, chat, 201);
    } catch (err) { next(err); }
  },
);

// POST /chats/group — create a group
router.post('/group',
  requireAuth,
  validate([
    body('name').trim().isLength({ min: 1, max: 64 }),
    body('memberIds').isArray({ min: 1 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { name, memberIds } = req.body as { name: string; memberIds: string[] };
      const allIds = [...new Set([userId, ...memberIds])];

      const chat = await prisma.chat.create({
        data: {
          type: 'group',
          name,
          createdById: userId,
          members: {
            create: allIds.map((id) => ({
              userId: id,
              role: id === userId ? 'owner' : 'member',
            })),
          },
        },
        include: {
          members: {
            include: { user: { select: { id: true, username: true, displayName: true, avatar: true, publicKey: true } } },
          },
        },
      });

      // Уведомляем всех участников о новом групповом чате
      const io = req.app.get('io') as SocketServer;
      if (io) {
        const chatWithMeta = { ...chat, unreadCount: 0, lastMessage: null };
        allIds.forEach((uid) => {
          io.to(`user:${uid}`).emit('chat:new', chatWithMeta);
          io.in(`user:${uid}`).socketsJoin(`chat:${chat.id}`);
        });
      }

      sendSuccess(res, chat, 201);
    } catch (err) { next(err); }
  },
);

// GET /chats/:chatId/messages
router.get('/:chatId/messages',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    query('cursor').optional(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;
      const cursor = req.query.cursor as string | undefined;
      const limit = Math.min(parseInt((req.query.limit as string) ?? '30', 10), 50);

      // Access check
      const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } });
      if (!member) throw new AppError(403, 'FORBIDDEN', 'You are not a member of this chat');

      const messages = await prisma.message.findMany({
        where: { chatId, deletedAt: null, ...(cursor ? { id: { lt: cursor } } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatar: true, publicKey: true } },
          media:     true,
          reads:     { select: { userId: true, readAt: true } },
          reactions: { select: { userId: true, emoji: true } },
          replyTo: {
            select: { id: true, type: true, content: true, senderId: true,
              sender: { select: { displayName: true } } },
          },
        },
      });

      const hasMore = messages.length === limit;
      const nextCursor = hasMore ? messages[messages.length - 1].id : undefined;

      sendSuccess(res, messages.reverse(), 200, { hasMore, cursor: nextCursor });
    } catch (err) { next(err); }
  },
);

// GET /chats/:chatId/media — все фото/видео/кружки для галереи в профиле
router.get('/:chatId/media',
  requireAuth,
  validate([param('chatId').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!member) throw new AppError(403, 'FORBIDDEN', 'Not a member');

      const messages = await prisma.message.findMany({
        where: {
          chatId,
          type: { in: ['image', 'video', 'circle'] },
          deletedAt: null,
          media: { isNot: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          type: true,
          media: {
            select: { url: true, thumbnailUrl: true, mimeType: true, width: true, height: true },
          },
        },
      });

      const result = messages
        .filter((m) => m.media)
        .map((m) => ({
          type: m.type as 'image' | 'video' | 'circle',
          url:          m.media!.url,
          thumbnailUrl: m.media!.thumbnailUrl,
          mimeType:     m.media!.mimeType,
          width:        m.media!.width,
          height:       m.media!.height,
        }));

      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

export default router;
