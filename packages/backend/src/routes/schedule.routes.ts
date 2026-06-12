import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { sendSuccess, AppError } from '../utils/response';

const router = Router();

const MAX_DELAY_MS = 365 * 24 * 60 * 60 * 1000; // максимум +1 год

// POST /messages/schedule — отложенное сообщение (sweeper отправит когда наступит sendAt)
router.post('/schedule',
  requireAuth,
  validate([
    body('chatId').isString().notEmpty(),
    body('sendAt').isISO8601(),
    body('type').equals('text'),
    body('content').isString().isLength({ min: 1, max: 10_000 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId, sendAt, type, content } = req.body as {
        chatId: string; sendAt: string; type: 'text'; content: string;
      };

      const sendAtDate = new Date(sendAt);
      const now = Date.now();
      if (sendAtDate.getTime() <= now) {
        throw new AppError(400, 'SEND_AT_PAST', 'sendAt must be in the future');
      }
      if (sendAtDate.getTime() > now + MAX_DELAY_MS) {
        throw new AppError(400, 'SEND_AT_TOO_FAR', 'sendAt must be within 1 year');
      }

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!member || member.leftAt) throw new AppError(403, 'FORBIDDEN', 'Not a member');

      const scheduled = await prisma.scheduledMessage.create({
        data: { userId, chatId, type, content, sendAt: sendAtDate },
      });
      sendSuccess(res, scheduled, 201);
    } catch (err) { next(err); }
  },
);

// GET /messages/scheduled?chatId= — мои отложенные сообщения
router.get('/scheduled',
  requireAuth,
  validate([query('chatId').optional().isString()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const chatId = req.query.chatId as string | undefined;

      const scheduled = await prisma.scheduledMessage.findMany({
        where: { userId, ...(chatId ? { chatId } : {}) },
        orderBy: { sendAt: 'asc' },
      });
      sendSuccess(res, scheduled);
    } catch (err) { next(err); }
  },
);

// DELETE /messages/scheduled/:id — отменить своё отложенное сообщение
router.delete('/scheduled/:id',
  requireAuth,
  validate([param('id').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { id } = req.params;

      // deleteMany с userId — удалить можно только своё
      const result = await prisma.scheduledMessage.deleteMany({ where: { id, userId } });
      if (result.count === 0) throw new AppError(404, 'NOT_FOUND', 'Scheduled message not found');

      sendSuccess(res, { deleted: id });
    } catch (err) { next(err); }
  },
);

export default router;
