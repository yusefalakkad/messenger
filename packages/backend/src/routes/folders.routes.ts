import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { sendSuccess, AppError } from '../utils/response';

const router = Router();

/** Привести prisma-запись к публичному shape (chatIds: Json → string[]). */
function shapeFolder(f: { id: string; name: string; emoji: string | null; chatIds: unknown; position: number }) {
  return {
    id: f.id,
    name: f.name,
    emoji: f.emoji,
    chatIds: Array.isArray(f.chatIds) ? (f.chatIds as string[]) : [],
    position: f.position,
  };
}

const chatIdsValidator = body('chatIds').isArray({ max: 200 })
  .custom((arr: unknown[]) => arr.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64))
  .withMessage('chatIds must be string[]');

// GET /folders — мои папки
router.get('/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const folders = await prisma.chatFolder.findMany({
        where: { userId },
        orderBy: { position: 'asc' },
      });
      sendSuccess(res, folders.map(shapeFolder));
    } catch (err) { next(err); }
  },
);

// POST /folders — создать папку
router.post('/',
  requireAuth,
  validate([
    body('name').trim().isString().isLength({ min: 1, max: 16 }),
    body('emoji').optional({ checkFalsy: true }).isString().isLength({ max: 8 }),
    chatIdsValidator,
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { name, emoji, chatIds } = req.body as { name: string; emoji?: string; chatIds: string[] };

      // Новая папка — в конец ленты
      const last = await prisma.chatFolder.findFirst({
        where: { userId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      const folder = await prisma.chatFolder.create({
        data: {
          userId,
          name,
          emoji: emoji || null,
          chatIds,
          position: (last?.position ?? -1) + 1,
        },
      });
      sendSuccess(res, shapeFolder(folder), 201);
    } catch (err) { next(err); }
  },
);

// PATCH /folders/:id — обновить (только своё)
router.patch('/:id',
  requireAuth,
  validate([
    param('id').notEmpty(),
    body('name').optional().trim().isString().isLength({ min: 1, max: 16 }),
    body('emoji').optional({ nullable: true }).custom((v) => v === null || (typeof v === 'string' && v.length <= 8)),
    body('chatIds').optional().isArray({ max: 200 })
      .custom((arr: unknown[]) => arr.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64)),
    body('position').optional().isInt({ min: 0, max: 10000 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const existing = await prisma.chatFolder.findFirst({ where: { id: req.params.id, userId } });
      if (!existing) throw new AppError(404, 'NOT_FOUND', 'Folder not found');

      const { name, emoji, chatIds, position } = req.body as {
        name?: string; emoji?: string | null; chatIds?: string[]; position?: number;
      };
      const folder = await prisma.chatFolder.update({
        where: { id: existing.id },
        data: {
          ...(name !== undefined && { name }),
          ...(emoji !== undefined && { emoji: emoji || null }),
          ...(chatIds !== undefined && { chatIds }),
          ...(position !== undefined && { position }),
        },
      });
      sendSuccess(res, shapeFolder(folder));
    } catch (err) { next(err); }
  },
);

// DELETE /folders/:id — удалить (только своё)
router.delete('/:id',
  requireAuth,
  validate([param('id').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const existing = await prisma.chatFolder.findFirst({ where: { id: req.params.id, userId } });
      if (!existing) throw new AppError(404, 'NOT_FOUND', 'Folder not found');

      await prisma.chatFolder.delete({ where: { id: existing.id } });
      sendSuccess(res, { deleted: true });
    } catch (err) { next(err); }
  },
);

export default router;
