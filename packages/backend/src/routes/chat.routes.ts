import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { Server as SocketServer } from 'socket.io';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { sendSuccess, AppError } from '../utils/response';
import { sanitizeMemberStatus } from '../utils/sanitizeUser';
import { signMediaUrlsDeep } from '../lib/mediaUrl';

const router = Router();

/**
 * inviteCode — СЕКРЕТ (даёт вход в чат любому). Prisma отдаёт все скаляры Chat,
 * поэтому перед любой отправкой chat-объекта клиенту (REST-ответ или socket-emit)
 * вычищаем поле. Код доступен только админам через GET/POST /chats/:chatId/invite-code.
 */
export function stripInviteCode<T extends { inviteCode?: string | null }>(chat: T): Omit<T, 'inviteCode'> {
  const { inviteCode: _inviteCode, ...rest } = chat;
  return rest;
}

/**
 * Список чатов с обогащением per-user state.
 *  - selfMember: { pinnedAt, archivedAt, mutedUntil } текущего юзера
 *  - unreadCount
 *  - sorted: pinned первыми (pinnedAt DESC), затем по lastMessage.createdAt DESC
 *  - archived чаты исключены по умолчанию; ?includeArchived=1 чтобы включить;
 *    onlyArchived=true возвращает только архив.
 */
async function listUserChats(
  userId: string,
  opts: { includeArchived?: boolean; onlyArchived?: boolean } = {},
) {
  const { includeArchived = false, onlyArchived = false } = opts;

  const memberFilter = onlyArchived
    ? { userId, leftAt: null, archivedAt: { not: null } }
    : includeArchived
      ? { userId, leftAt: null }
      : { userId, leftAt: null, archivedAt: null };

  // Мой username — для подсчёта непрочитанных упоминаний (@username).
  // Без username упоминания невозможны → unreadMentions = 0.
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  const myMention = me?.username ? `@${me.username}` : null;

  const chats = await prisma.chat.findMany({
    where: { members: { some: memberFilter } },
    include: {
      members: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true, username: true, displayName: true, avatar: true,
              status: true, lastSeenAt: true, publicKey: true,
              // только для sanitizeMemberStatus — наружу stripается
              lastSeenVisibility: true,
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          sender: { select: { id: true, displayName: true } },
          // Для галочки статуса в списке чатов (отправлено/прочитано последнее своё).
          reads:  { select: { userId: true, readAt: true } },
        },
      },
    },
  });

  const enriched = await Promise.all(chats.map(async (chat) => {
    const selfMember = chat.members.find((m) => m.userId === userId);
    const unreadCount = await prisma.message.count({
      where: {
        chatId: chat.id,
        deletedAt: null,
        senderId: { not: userId },
        reads: { none: { userId } },
      },
    });
    // Непрочитанные упоминания: только нешифрованные чужие сообщения с @myUsername
    // (для E2E-шифрованных контент серверу недоступен)
    const unreadMentions = myMention
      ? await prisma.message.count({
          where: {
            chatId: chat.id,
            deletedAt: null,
            encrypted: false,
            senderId: { not: userId },
            reads: { none: { userId } },
            content: { contains: myMention, mode: 'insensitive' },
          },
        })
      : 0;
    return {
      ...stripInviteCode(chat),
      // Приватность: статус участников с lastSeenVisibility='nobody' скрываем
      // (кроме самого requester'а); lastSeenVisibility наружу не отдаём.
      members: chat.members.map((m) => ({ ...m, user: sanitizeMemberStatus(m.user, userId) })),
      unreadCount,
      unreadMentions,
      pinnedAt:   selfMember?.pinnedAt ?? null,
      archivedAt: selfMember?.archivedAt ?? null,
      mutedUntil: selfMember?.mutedUntil ?? null,
      wallpaper:  selfMember?.wallpaper ?? null,
      draft:      selfMember?.draft ?? null,
    };
  }));

  // Sort: pinned first (newest pin first), then by lastMessage.createdAt desc.
  enriched.sort((a, b) => {
    const aPinned = a.pinnedAt ? a.pinnedAt.getTime() : 0;
    const bPinned = b.pinnedAt ? b.pinnedAt.getTime() : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    const aLast = a.messages[0]?.createdAt?.getTime() ?? a.updatedAt.getTime();
    const bLast = b.messages[0]?.createdAt?.getTime() ?? b.updatedAt.getTime();
    return bLast - aLast;
  });

  return enriched;
}

// GET /chats — list user's chats (non-archived by default)
router.get('/',
  requireAuth,
  validate([query('includeArchived').optional().isIn(['0', '1', 'true', 'false'])]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const includeArchived = ['1', 'true'].includes((req.query.includeArchived as string) ?? '');
      const result = await listUserChats(userId, { includeArchived });
      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// GET /chats/archived — only archived chats for current user
router.get('/archived',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const result = await listUserChats(userId, { onlyArchived: true });
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

      // Check if direct chat already exists. БУДЬ ОСТОРОЖЕН: `every` в Prisma
      // считает chat с 0 active members как match — вернёт «осиротевший» чат.
      // Делаем явно: оба участника АКТИВНЫ.
      const existing = await prisma.chat.findFirst({
        where: {
          type: 'direct',
          AND: [
            { members: { some: { userId, leftAt: null } } },
            { members: { some: { userId: targetUserId, leftAt: null } } },
          ],
        },
        include: {
          members: {
            where: { leftAt: null },
            include: { user: { select: { id: true, username: true, displayName: true, avatar: true, publicKey: true } } },
          },
        },
      });

      // Дополнительная гарантия: ровно 2 активных members. Если меньше — это
      // осиротевший чат, не используем.
      if (existing && existing.members.length === 2) { sendSuccess(res, stripInviteCode(existing)); return; }

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

      // Уведомляем обоих участников о новом чате через их личные комнаты.
      // ВАЖНО: сначала socketsJoin (await), потом emit('chat:new'). Иначе
      // первое сообщение из этого чата может уйти в room, в которой ещё нет
      // получателя — message:new потеряется.
      const io = req.app.get('io') as SocketServer;
      if (io) {
        const chatWithMeta = signMediaUrlsDeep({ ...stripInviteCode(chat), unreadCount: 0, unreadMentions: 0, lastMessage: null });
        await Promise.all([userId, targetUserId].map(async (uid) => {
          await io.in(`user:${uid}`).socketsJoin(`chat:${chat.id}`);
          io.to(`user:${uid}`).emit('chat:new', chatWithMeta);
        }));
      }

      sendSuccess(res, stripInviteCode(chat), 201);
    } catch (err) { next(err); }
  },
);

// POST /chats/saved — «Избранное»: личный чат с единственным участником (я).
// Идемпотентно: возвращает существующий saved-чат или создаёт новый.
// name/avatar = null — клиент сам рендерит «Избранное».
router.post('/saved',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;

      const existing = await prisma.chat.findFirst({
        where: {
          type: 'saved',
          members: { some: { userId, leftAt: null } },
        },
        include: {
          members: {
            where: { leftAt: null },
            include: { user: { select: { id: true, username: true, displayName: true, avatar: true, publicKey: true } } },
          },
        },
      });
      if (existing) { sendSuccess(res, stripInviteCode(existing)); return; }

      const chat = await prisma.chat.create({
        data: {
          type: 'saved',
          createdById: userId,
          members: { create: [{ userId, role: 'owner' }] },
        },
        include: {
          members: {
            include: { user: { select: { id: true, username: true, displayName: true, avatar: true, publicKey: true } } },
          },
        },
      });

      // Join в комнату + уведомление (мульти-девайс): как в POST /direct —
      // сначала socketsJoin, потом emit, иначе первое сообщение потеряется.
      const io = req.app.get('io') as SocketServer | undefined;
      if (io) {
        const chatWithMeta = signMediaUrlsDeep({ ...stripInviteCode(chat), unreadCount: 0, unreadMentions: 0, lastMessage: null });
        await io.in(`user:${userId}`).socketsJoin(`chat:${chat.id}`);
        io.to(`user:${userId}`).emit('chat:new', chatWithMeta);
      }

      sendSuccess(res, stripInviteCode(chat), 201);
    } catch (err) { next(err); }
  },
);

// POST /chats/group — create a group (username — опциональный публичный хэндл)
router.post('/group',
  requireAuth,
  validate([
    body('name').trim().isLength({ min: 1, max: 64 }),
    body('memberIds').isArray({ min: 1 }),
    body('username').optional({ nullable: true }).isString().isLength({ max: 64 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { name, memberIds } = req.body as { name: string; memberIds: string[] };
      const allIds = [...new Set([userId, ...memberIds])];

      // username — публичный хэндл группы (как у каналов): lowercase [a-z0-9_]{5,32};
      // null — приватная группа (вход только по invite-ссылке)
      let username: string | null = null;
      const rawUsername = req.body.username as string | null | undefined;
      if (rawUsername != null && rawUsername !== '') {
        username = String(rawUsername).trim().toLowerCase();
        if (!/^[a-z0-9_]{5,32}$/.test(username)) {
          throw new AppError(400, 'BAD_USERNAME', 'Username must be 5-32 chars of a-z, 0-9, _');
        }
        const taken = await prisma.chat.findUnique({ where: { username }, select: { id: true } });
        if (taken) throw new AppError(409, 'USERNAME_TAKEN', 'Username already taken');
      }

      const chat = await prisma.chat.create({
        data: {
          type: 'group',
          name,
          username,
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

      // Уведомляем всех участников о новом групповом чате.
      // socketsJoin сначала (await), потом emit — иначе первое сообщение из этого
      // чата уйдёт в room, где ещё нет получателей.
      const io = req.app.get('io') as SocketServer;
      if (io) {
        const chatWithMeta = signMediaUrlsDeep({ ...stripInviteCode(chat), unreadCount: 0, unreadMentions: 0, lastMessage: null });
        await Promise.all(allIds.map(async (uid) => {
          await io.in(`user:${uid}`).socketsJoin(`chat:${chat.id}`);
          io.to(`user:${uid}`).emit('chat:new', chatWithMeta);
        }));
      }

      sendSuccess(res, stripInviteCode(chat), 201);
    } catch (err) {
      // P2002 — гонка по уникальному username между check'ом и create
      if ((err as { code?: string }).code === 'P2002') {
        next(new AppError(409, 'USERNAME_TAKEN', 'Username already taken'));
        return;
      }
      next(err);
    }
  },
);

// POST /chats/channel — создать канал (creator = owner)
router.post('/channel',
  requireAuth,
  validate([
    body('name').trim().isLength({ min: 1, max: 64 }),
    body('username').optional({ nullable: true }).isString().isLength({ max: 64 }),
    body('description').optional({ nullable: true }).isString().isLength({ max: 255 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { name, description } = req.body as { name: string; description?: string | null };

      // username — публичный хэндл: lowercase [a-z0-9_]{5,32}; null — приватный канал
      let username: string | null = null;
      const rawUsername = req.body.username as string | null | undefined;
      if (rawUsername != null && rawUsername !== '') {
        username = String(rawUsername).trim().toLowerCase();
        if (!/^[a-z0-9_]{5,32}$/.test(username)) {
          throw new AppError(400, 'BAD_USERNAME', 'Username must be 5-32 chars of a-z, 0-9, _');
        }
        const taken = await prisma.chat.findUnique({ where: { username }, select: { id: true } });
        if (taken) throw new AppError(409, 'USERNAME_TAKEN', 'Channel username already taken');
      }

      const chat = await prisma.chat.create({
        data: {
          type: 'channel',
          name,
          description: description?.trim() || null,
          username,
          createdById: userId,
          members: { create: [{ userId, role: 'owner' }] },
        },
        include: {
          members: {
            include: { user: { select: { id: true, username: true, displayName: true, avatar: true, publicKey: true } } },
          },
        },
      });

      // socketsJoin сначала (await), потом emit — как в POST /chats/group
      const io = req.app.get('io') as SocketServer | undefined;
      if (io) {
        const chatWithMeta = signMediaUrlsDeep({ ...stripInviteCode(chat), unreadCount: 0, unreadMentions: 0, lastMessage: null });
        await io.in(`user:${userId}`).socketsJoin(`chat:${chat.id}`);
        io.to(`user:${userId}`).emit('chat:new', chatWithMeta);
      }

      sendSuccess(res, stripInviteCode(chat), 201);
    } catch (err) {
      // P2002 — гонка по уникальному username между check'ом и create
      if ((err as { code?: string }).code === 'P2002') {
        next(new AppError(409, 'USERNAME_TAKEN', 'Channel username already taken'));
        return;
      }
      next(err);
    }
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
          poll:      { include: { votes: { select: { optionId: true, userId: true } } } },
          replyTo: {
            // encrypted+nonce обязательны для корректного reply-preview шифрованных сообщений
            // (без них клиент рендерит base64 ciphertext вместо «🔒 Зашифрованное сообщение»).
            // media — для превью медиа-reply'ев.
            select: {
              id: true, type: true, content: true, senderId: true,
              encrypted: true, nonce: true,
              sender: { select: { displayName: true } },
              media: { select: { url: true, thumbnailUrl: true, mimeType: true } },
            },
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

// GET /chats/:chatId/messages/around?messageId=&radius=25 — окно сообщений вокруг
// target (radius до и после по createdAt, target включительно), ascending.
// Для jump-to-message когда target ещё не подгружен пагинацией.
router.get('/:chatId/messages/around',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    query('messageId').notEmpty(),
    query('radius').optional().isInt({ min: 1, max: 50 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;
      const messageId = req.query.messageId as string;
      const radius = Math.min(parseInt((req.query.radius as string) ?? '25', 10), 50);

      const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } });
      if (!member) throw new AppError(403, 'FORBIDDEN', 'You are not a member of this chat');

      // include как в GET messages — клиент мержит результат в общий список
      const include = {
        sender: { select: { id: true, username: true, displayName: true, avatar: true, publicKey: true } },
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

      const target = await prisma.message.findFirst({
        where: { id: messageId, chatId, deletedAt: null },
        include,
      });
      if (!target) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found in this chat');

      const [before, after] = await Promise.all([
        prisma.message.findMany({
          where: { chatId, deletedAt: null, createdAt: { lt: target.createdAt } },
          orderBy: { createdAt: 'desc' },
          take: radius,
          include,
        }),
        prisma.message.findMany({
          where: { chatId, deletedAt: null, createdAt: { gt: target.createdAt } },
          orderBy: { createdAt: 'asc' },
          take: radius,
          include,
        }),
      ]);

      sendSuccess(res, [...before.reverse(), target, ...after]);
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

      // SECURITY: в группах wipe истории — только owner/admin.
      // В direct-чате разрешён обеим сторонам.
      const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } });
      if (chat?.type === 'group' && member.role === 'member') {
        throw new AppError(403, 'INSUFFICIENT_ROLE', 'Only admins can clear group history');
      }

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
      io?.to(`chat:${chatId}`).emit('chat:updated', signMediaUrlsDeep({ chatId, name: updated.name, avatar: updated.avatar }));

      sendSuccess(res, stripInviteCode(updated));
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
        const signedChat = signMediaUrlsDeep({ ...stripInviteCode(updatedChat) });
        // Существующим — chat:updated
        io.to(`chat:${chatId}`).emit('chat:updated', { chatId, members: signedChat.members });
        // Новым — chat:new + join в комнату
        toAdd.forEach((uid) => {
          io.to(`user:${uid}`).emit('chat:new', { ...signedChat, unreadCount: 0, unreadMentions: 0, lastMessage: null });
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

// PATCH /chats/:chatId/members/:targetUserId/role — назначить/снять админа.
// Только owner. Нельзя менять роль owner'а и свою.
router.patch('/:chatId/members/:targetUserId/role',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    param('targetUserId').notEmpty(),
    body('role').isIn(['admin', 'member']),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId, targetUserId } = req.params;
      const { role } = req.body as { role: 'admin' | 'member' };

      const me = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!me || me.leftAt) throw new AppError(403, 'FORBIDDEN', 'Not a member');
      if (me.role !== 'owner') throw new AppError(403, 'OWNER_ONLY', 'Only the owner can change roles');
      if (targetUserId === userId) throw new AppError(400, 'CANNOT_CHANGE_OWN_ROLE', 'Cannot change own role');

      const target = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId: targetUserId } },
      });
      if (!target || target.leftAt) throw new AppError(404, 'NOT_FOUND', 'Member not found');
      if (target.role === 'owner') throw new AppError(403, 'CANNOT_CHANGE_OWNER', 'Cannot change owner role');

      await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: targetUserId } },
        data: { role },
      });

      const io = req.app.get('io') as SocketServer | undefined;
      if (io) io.to(`chat:${chatId}`).emit('chat:member-role', { chatId, userId: targetUserId, role });

      sendSuccess(res, { userId: targetUserId, role });
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

// POST /chats/:chatId/polls — создать опрос (Message type=poll + Poll)
router.post('/:chatId/polls',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    body('question').isString().trim().isLength({ min: 1, max: 300 }),
    body('options').isArray({ min: 2, max: 10 }),
    body('options.*').isString().trim().isLength({ min: 1, max: 100 }),
    body('multiple').optional().isBoolean(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;
      const { question, options, multiple } = req.body as {
        question: string; options: string[]; multiple?: boolean;
      };

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!member || member.leftAt) throw new AppError(403, 'FORBIDDEN', 'Not a member');

      // В каналах опросы создают только owner/admin (как и обычные посты)
      const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } });
      if (chat?.type === 'channel' && member.role !== 'owner' && member.role !== 'admin') {
        throw new AppError(403, 'CHANNEL_POST_FORBIDDEN', 'Only admins can post in channels');
      }

      const message = await prisma.message.create({
        data: {
          chatId,
          senderId: userId,
          type: 'poll',
          content: question,
          poll: {
            create: {
              question,
              // id варианта — случайная строка, по ней голосуют
              options: options.map((text) => ({ id: crypto.randomBytes(6).toString('hex'), text })),
              multiple: multiple === true,
            },
          },
        },
        include: {
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
        },
      });

      // Сортировка списка чатов — как в message:send
      await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

      const io = req.app.get('io') as SocketServer | undefined;
      io?.to(`chat:${chatId}`).emit('message:new', signMediaUrlsDeep({ ...message }));

      sendSuccess(res, message, 201);
    } catch (err) { next(err); }
  },
);

// GET /chats/:chatId/pinned — закреплённые сообщения чата
router.get('/:chatId/pinned',
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
        where: { chatId, pinnedAt: { not: null }, deletedAt: null },
        orderBy: { pinnedAt: 'desc' },
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatar: true } },
          media:  true,
          poll:   { include: { votes: { select: { optionId: true, userId: true } } } },
        },
      });

      sendSuccess(res, messages);
    } catch (err) { next(err); }
  },
);

// ─── Ссылка-приглашение (группа/канал, только owner|admin) ───────────────────

// Проверяет права и тип чата, возвращает текущий inviteCode
async function requireInviteAdmin(chatId: string, userId: string): Promise<{ inviteCode: string | null }> {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { role: true, leftAt: true },
  });
  if (!member || member.leftAt) throw new AppError(403, 'FORBIDDEN', 'Not a member');
  if (member.role !== 'owner' && member.role !== 'admin') {
    throw new AppError(403, 'INSUFFICIENT_ROLE', 'Admin or owner only');
  }
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { type: true, inviteCode: true },
  });
  if (!chat || (chat.type !== 'channel' && chat.type !== 'group')) {
    throw new AppError(400, 'NOT_INVITABLE', 'Only groups and channels have invite links');
  }
  return { inviteCode: chat.inviteCode };
}

// GET /chats/:chatId/invite-code — получить код (сгенерировать если ещё нет)
router.get('/:chatId/invite-code',
  requireAuth,
  validate([param('chatId').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;

      const { inviteCode } = await requireInviteAdmin(chatId, userId);
      let code = inviteCode;
      if (!code) {
        code = crypto.randomBytes(8).toString('hex');
        await prisma.chat.update({ where: { id: chatId }, data: { inviteCode: code } });
      }
      sendSuccess(res, { code });
    } catch (err) { next(err); }
  },
);

// POST /chats/:chatId/invite-code — принудительная регенерация (старая ссылка умирает)
router.post('/:chatId/invite-code',
  requireAuth,
  validate([param('chatId').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;

      await requireInviteAdmin(chatId, userId);
      const code = crypto.randomBytes(8).toString('hex');
      await prisma.chat.update({ where: { id: chatId }, data: { inviteCode: code } });
      sendSuccess(res, { code });
    } catch (err) { next(err); }
  },
);

// ─── Per-user chat state: pin / archive / mute ────────────────────────────────

const MAX_PINNED_CHATS = 5;
// "forever" → 9999-12-31T23:59:59.999Z. Используем для permanent mute.
const FOREVER_DATE = new Date('9999-12-31T23:59:59.999Z');

function emitChatState(
  req: Request,
  userId: string,
  chatId: string,
  member: { pinnedAt: Date | null; archivedAt: Date | null; mutedUntil: Date | null },
): void {
  const io = req.app.get('io') as SocketServer | undefined;
  io?.to(`user:${userId}`).emit('chat:state-updated', {
    chatId,
    pinned:     member.pinnedAt !== null,
    archived:   member.archivedAt !== null,
    pinnedAt:   member.pinnedAt,
    archivedAt: member.archivedAt,
    mutedUntil: member.mutedUntil,
  });
}

// PATCH /chats/:chatId/pin   body { pinned: boolean }
router.patch('/:chatId/pin',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    body('pinned').isBoolean(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;
      const pinned: boolean = req.body.pinned === true || req.body.pinned === 'true';

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!member || member.leftAt) throw new AppError(403, 'FORBIDDEN', 'Not a member');

      if (pinned && !member.pinnedAt) {
        // Enforce pin limit (don't count already-pinned chat being re-pinned).
        const pinnedCount = await prisma.chatMember.count({
          where: { userId, pinnedAt: { not: null }, leftAt: null },
        });
        if (pinnedCount >= MAX_PINNED_CHATS) {
          throw new AppError(400, 'PIN_LIMIT_REACHED',
            `Cannot pin more than ${MAX_PINNED_CHATS} chats`);
        }
      }

      const updated = await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: { pinnedAt: pinned ? new Date() : null },
        select: { pinnedAt: true, archivedAt: true, mutedUntil: true },
      });

      emitChatState(req, userId, chatId, updated);
      sendSuccess(res, { chatId, ...updated });
    } catch (err) { next(err); }
  },
);

// PATCH /chats/:chatId/archive   body { archived: boolean }
router.patch('/:chatId/archive',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    body('archived').isBoolean(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;
      const archived: boolean = req.body.archived === true || req.body.archived === 'true';

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!member || member.leftAt) throw new AppError(403, 'FORBIDDEN', 'Not a member');

      const updated = await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: { archivedAt: archived ? new Date() : null },
        select: { pinnedAt: true, archivedAt: true, mutedUntil: true },
      });

      emitChatState(req, userId, chatId, updated);
      sendSuccess(res, { chatId, ...updated });
    } catch (err) { next(err); }
  },
);

// PATCH /chats/:chatId/mute   body { until: string|null }
// null/undefined → unmute, "forever" → permanent, иначе ISO-string.
router.patch('/:chatId/mute',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    body('until').custom((value) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') throw new Error('until must be string or null');
      if (value === 'forever') return true;
      if (Number.isNaN(Date.parse(value))) throw new Error('until must be ISO-8601 or "forever"');
      return true;
    }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;
      const until = req.body.until as string | null | undefined;

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!member || member.leftAt) throw new AppError(403, 'FORBIDDEN', 'Not a member');

      let mutedUntil: Date | null;
      if (until === null || until === undefined) {
        mutedUntil = null;
      } else if (until === 'forever') {
        mutedUntil = FOREVER_DATE;
      } else {
        mutedUntil = new Date(until);
      }

      const updated = await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: { mutedUntil },
        select: { pinnedAt: true, archivedAt: true, mutedUntil: true },
      });

      emitChatState(req, userId, chatId, updated);
      sendSuccess(res, { chatId, ...updated });
    } catch (err) { next(err); }
  },
);

// PUT /chats/:chatId/draft   body { text: string | null }
// Синхронизация черновика между устройствами (per-user state в ChatMember).
router.put('/:chatId/draft',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    body('text').custom((value) => {
      if (value === null) return true;
      if (typeof value !== 'string') throw new Error('text must be string or null');
      if (value.length > 10_000) throw new Error('text too long');
      return true;
    }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;
      const text = req.body.text as string | null;

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!member || member.leftAt) throw new AppError(403, 'FORBIDDEN', 'Not a member');

      // Пустая строка = очистка черновика
      const draft = text && text.length > 0 ? text : null;
      const updated = await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: { draft, draftUpdatedAt: draft ? new Date() : null },
        select: { draft: true, draftUpdatedAt: true },
      });
      sendSuccess(res, { chatId, ...updated });
    } catch (err) { next(err); }
  },
);

// Валидные пресеты обоев чата (рендерятся клиентом как CSS-градиенты)
const WALLPAPER_PRESETS = new Set(['aurora', 'sunset', 'ocean', 'forest', 'mono', 'candy']);

// PUT /chats/:chatId/wallpaper   body { wallpaper: string | null }
// null — обои по умолчанию. Per-user state — у каждого участника свои обои.
router.put('/:chatId/wallpaper',
  requireAuth,
  validate([
    param('chatId').notEmpty(),
    body('wallpaper').custom((value) => {
      if (value === null) return true;
      // Пресет ИЛИ кастомный URL загруженного изображения (владение проверяется в обработчике).
      if (typeof value !== 'string' || value.length > 2048) {
        throw new Error('wallpaper must be null, a preset, or an uploaded image URL');
      }
      return true;
    }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.params;
      const wallpaper = req.body.wallpaper as string | null;

      // Кастомные обои: разрешаем ТОЛЬКО своё загруженное изображение (image/<userId>/...),
      // иначе можно подсунуть чужой/внешний URL.
      if (wallpaper !== null && !WALLPAPER_PRESETS.has(wallpaper) && !wallpaper.includes(`image/${userId}/`)) {
        throw new AppError(403, 'WALLPAPER_FORBIDDEN', 'Custom wallpaper must be your own uploaded image');
      }

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!member || member.leftAt) throw new AppError(403, 'FORBIDDEN', 'Not a member');

      const updated = await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: { wallpaper },
        select: { wallpaper: true },
      });
      sendSuccess(res, { chatId, ...updated });
    } catch (err) { next(err); }
  },
);

export default router;
