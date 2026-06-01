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

// GET /chats/:chatId/messages/search?q=... — поиск (только по нешифрованному тексту)
// Для E2E сообщений поиск идёт на клиенте после расшифровки.
router.get('/:chatId/messages/search',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    query('q').trim().isLength({ min: 1, max: 100 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;
      const q = (req.query.q as string).trim();

      const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } });
      if (!member) throw new AppError(403, 'FORBIDDEN', 'You are not a member of this chat');

      const messages = await prisma.message.findMany({
        where: {
          chatId,
          deletedAt: null,
          encrypted: false,
          content: { contains: q, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatar: true } },
          media:  true,
        },
      });

      sendSuccess(res, messages);
    } catch (err) { next(err); }
  },
);

// DELETE /chats/:chatId/messages — clear all messages in chat
router.delete('/:chatId/messages',
  requireAuth,
  validate([param('chatId').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;

      const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } });
      if (!member) throw new AppError(403, 'FORBIDDEN', 'You are not a member of this chat');

      await prisma.message.updateMany({
        where: { chatId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      sendSuccess(res, { cleared: true });
    } catch (err) { next(err); }
  },
);

// PATCH /chats/:chatId — переименование группы (только admin/owner)
router.patch('/:chatId',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    body('name').optional().isString().isLength({ min: 1, max: 64 }),
    body('avatar').optional({ nullable: true }).isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;
      const { name, avatar } = req.body as { name?: string; avatar?: string | null };

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!member) throw new AppError(403, 'FORBIDDEN', 'Not a member');

      const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } });
      if (chat?.type !== 'group') throw new AppError(400, 'NOT_GROUP', 'Only groups can be renamed');
      if (member.role === 'member') throw new AppError(403, 'INSUFFICIENT_ROLE', 'Admin or owner only');

      const updated = await prisma.chat.update({
        where: { id: chatId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(avatar !== undefined ? { avatar } : {}),
        },
      });

      // Broadcast обновление всем участникам через комнату чата
      const io = req.app.get('io') as SocketServer | undefined;
      io?.to(`chat:${chatId}`).emit('chat:updated', { chatId, name: updated.name, avatar: updated.avatar });

      sendSuccess(res, updated);
    } catch (err) { next(err); }
  },
);

// POST /chats/:chatId/members — добавить участников в группу (admin/owner)
router.post('/:chatId/members',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    body('userIds').isArray({ min: 1, max: 50 }),
    body('userIds.*').isString().notEmpty(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;
      const { userIds } = req.body as { userIds: string[] };

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!member) throw new AppError(403, 'FORBIDDEN', 'Not a member');
      if (member.role === 'member') throw new AppError(403, 'INSUFFICIENT_ROLE', 'Admin or owner only');

      const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } });
      if (chat?.type !== 'group') throw new AppError(400, 'NOT_GROUP', 'Only groups can have members added');

      // Игнорим уже состоящих
      const existing = await prisma.chatMember.findMany({
        where: { chatId, userId: { in: userIds } },
        select: { userId: true },
      });
      const existingSet = new Set(existing.map((m) => m.userId));
      const toAdd = userIds.filter((id) => !existingSet.has(id));

      if (toAdd.length > 0) {
        await prisma.chatMember.createMany({
          data: toAdd.map((uid) => ({ chatId, userId: uid, role: 'member' as const })),
          skipDuplicates: true,
        });
      }

      // Возвращаем актуальный список членов
      const updatedChat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
          members: {
            where: { leftAt: null },
            include: { user: { select: { id: true, username: true, displayName: true, avatar: true, status: true, publicKey: true } } },
          },
        },
      });

      const io = req.app.get('io') as SocketServer | undefined;
      if (io && updatedChat) {
        // Существующим — chat:updated
        io.to(`chat:${chatId}`).emit('chat:updated', { chatId, members: updatedChat.members });
        // Новым — chat:new + join в комнату
        toAdd.forEach((uid) => {
          io.to(`user:${uid}`).emit('chat:new', { ...updatedChat, unreadCount: 0, lastMessage: null });
          io.in(`user:${uid}`).socketsJoin(`chat:${chatId}`);
        });
      }

      sendSuccess(res, { added: toAdd, members: updatedChat?.members ?? [] });
    } catch (err) { next(err); }
  },
);

// DELETE /chats/:chatId/members/:targetUserId — kick участника
// или leave если targetUserId === self
router.delete('/:chatId/members/:targetUserId',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    param('targetUserId').notEmpty(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId, targetUserId } = req.params;
      const isSelf = targetUserId === userId;

      const me = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!me) throw new AppError(403, 'FORBIDDEN', 'Not a member');

      const target = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId: targetUserId } },
      });
      if (!target) throw new AppError(404, 'NOT_FOUND', 'Member not found');

      if (!isSelf) {
        if (me.role === 'member') throw new AppError(403, 'INSUFFICIENT_ROLE', 'Admin or owner only');
        // owner > admin > member; admin не может кикнуть owner
        if (target.role === 'owner') throw new AppError(403, 'CANNOT_KICK_OWNER', 'Cannot kick owner');
      }

      // Soft delete — ставим leftAt
      await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: targetUserId } },
        data: { leftAt: new Date() },
      });

      const io = req.app.get('io') as SocketServer | undefined;
      if (io) {
        // Уведомить чат об уходе
        io.to(`chat:${chatId}`).emit('chat:member-left', { chatId, userId: targetUserId });
        // Удалить ушедшего из комнаты
        io.in(`user:${targetUserId}`).socketsLeave(`chat:${chatId}`);
        // Cообщить лично что чат закрылся (для list-update)
        io.to(`user:${targetUserId}`).emit('chat:removed', { chatId });
      }

      sendSuccess(res, { removed: targetUserId, isSelf });
    } catch (err) { next(err); }
  },
);

// POST /chats/:chatId/mute — toggle mute, until=null отключает mute
router.post('/:chatId/mute',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    body('mutedUntil').optional({ nullable: true }).isISO8601(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;
      const { mutedUntil } = req.body as { mutedUntil?: string | null };

      const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } });
      if (!member) throw new AppError(403, 'FORBIDDEN', 'Not a member');

      const result = await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: { mutedUntil: mutedUntil ? new Date(mutedUntil) : null },
        select: { mutedUntil: true },
      });
      sendSuccess(res, { mutedUntil: result.mutedUntil });
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
