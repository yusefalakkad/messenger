import { Router, Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { sanitizeMemberStatus } from '../utils/sanitizeUser';

const router = Router();

// GET /search?q=&limit=30 — глобальный поиск по чатам и сообщениям.
// Чаты: по name и по displayName/username участников; только где я активный member.
// Сообщения: только нешифрованные (E2E ищется на клиенте), не удалённые.
router.get('/',
  requireAuth,
  validate([
    query('q').isString().trim().isLength({ min: 1, max: 100 }),
    query('limit').optional().isInt({ min: 1, max: 30 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const q = (req.query.q as string).trim();
      const limit = Math.min(parseInt((req.query.limit as string) ?? '30', 10) || 30, 30);

      const [chats, messages] = await Promise.all([
        prisma.chat.findMany({
          where: {
            members: { some: { userId, leftAt: null } },
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              {
                members: {
                  some: {
                    leftAt: null,
                    user: {
                      OR: [
                        { displayName: { contains: q, mode: 'insensitive' } },
                        { username:    { contains: q, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              },
            ],
          },
          take: limit,
          orderBy: { updatedAt: 'desc' },
          include: {
            members: {
              where: { leftAt: null },
              include: {
                user: {
                  // lastSeenVisibility — только для sanitizeMemberStatus, наружу stripается
                  select: { id: true, username: true, displayName: true, avatar: true, status: true, publicKey: true, lastSeenVisibility: true },
                },
              },
            },
          },
        }),
        prisma.message.findMany({
          where: {
            deletedAt: null,
            encrypted: false,
            content: { contains: q, mode: 'insensitive' },
            chat: { members: { some: { userId, leftAt: null } } },
          },
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: { select: { id: true, username: true, displayName: true, avatar: true } },
            media:  true,
            chat:   { select: { id: true, name: true, type: true } },
          },
        }),
      ]);

      // Приватность: скрытый онлайн-статус не утекает через поиск
      const sanitizedChats = chats.map((chat) => ({
        ...chat,
        members: chat.members.map((m) => ({ ...m, user: sanitizeMemberStatus(m.user, userId) })),
      }));

      sendSuccess(res, { chats: sanitizedChats, messages });
    } catch (err) { next(err); }
  },
);

export default router;
