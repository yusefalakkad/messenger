import { Router } from 'express';
import { body, param, query } from 'express-validator';
import argon2 from 'argon2';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { isUserOnline } from '../lib/redis';
import { sendSuccess, AppError } from '../utils/response';
import { sanitizeMemberStatus } from '../utils/sanitizeUser';
import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { uploadFile, generateObjectName } from '../lib/minio';
import { config } from '../config';

// Те же параметры, что и в auth.service.ts (Argon2id, OWASP)
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxImageSize },
  fileFilter: (_req, file, cb) => {
    if ((config.upload.allowedImageTypes as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type for avatar'));
    }
  },
});

// GET /users/search?q=...
router.get('/search',
  requireAuth,
  validate([query('q').trim().isLength({ min: 1 })]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = req.query.q as string;
      const { userId } = req as AuthRequest;

      // Списки тех, кого я заблокировал и кто заблокировал меня — исключаем из поиска
      const [blockedByMe, blockingMe] = await Promise.all([
        prisma.contact.findMany({ where: { ownerId: userId, blocked: true }, select: { targetId: true } }),
        prisma.contact.findMany({ where: { targetId: userId, blocked: true }, select: { ownerId: true } }),
      ]);
      const excludedIds = new Set([
        userId,
        ...blockedByMe.map((b) => b.targetId),
        ...blockingMe.map((b) => b.ownerId),
      ]);

      const users = await prisma.user.findMany({
        where: {
          deletedAt: null,
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
            { phone: q },
          ],
          id: { notIn: [...excludedIds] },
        },
        select: { id: true, username: true, displayName: true, avatar: true, bio: true, publicKey: true },
        take: 20,
      });
      sendSuccess(res, users);
    } catch (err) { next(err); }
  },
);

// GET /users/by-username/:username — публичный профиль по хэндлу (QR / ссылки /u/:username)
router.get('/by-username/:username',
  requireAuth,
  validate([param('username').isString().trim().isLength({ min: 1, max: 64 })]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const username = (req.params.username as string).trim().toLowerCase();
      const user = await prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' }, deletedAt: null },
        select: { id: true, username: true, displayName: true, avatar: true, bio: true },
      });
      if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
      sendSuccess(res, user);
    } catch (err) { next(err); }
  },
);

// GET /users/:id
router.get('/:id',
  requireAuth,
  validate([param('id').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const user = await prisma.user.findUnique({
        where: { id: req.params.id, deletedAt: null },
        // lastSeenVisibility — только для проверки приватности, наружу stripается
        select: { id: true, username: true, displayName: true, avatar: true, bio: true, status: true, lastSeenAt: true, publicKey: true, createdAt: true, lastSeenVisibility: true },
      });
      if (!user) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }); return; }
      const online = await isUserOnline(user.id);
      sendSuccess(res, sanitizeMemberStatus({ ...user, status: online ? 'online' : 'offline' }, userId));
    } catch (err) { next(err); }
  },
);

// PATCH /users/me — update profile
router.patch('/me',
  requireAuth,
  validate([
    body('displayName').optional().trim().isLength({ min: 1, max: 64 }),
    body('bio').optional().trim().isLength({ max: 140 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { displayName, bio } = req.body;
      const user = await prisma.user.update({
        where: { id: userId },
        data: { ...(displayName && { displayName }), ...(bio !== undefined && { bio }) },
        select: { id: true, username: true, displayName: true, avatar: true, bio: true },
      });
      sendSuccess(res, user);
    } catch (err) { next(err); }
  },
);

// PATCH /users/me/public-key — обновить E2E publicKey (новое устройство / regen).
// Принимает свежий base64-SPKI P-256 ключ от клиента (124 символа стандартно).
// После rotation старые входящие сообщения становятся не расшифровываемыми —
// это by design phone-auth.
router.patch('/me/public-key',
  requireAuth,
  validate([
    body('publicKey').isString()
      .isLength({ min: 100, max: 256 })
      .matches(/^[A-Za-z0-9+/=]+$/).withMessage('publicKey must be base64'),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { publicKey } = req.body;
      const user = await prisma.user.update({
        where: { id: userId },
        data: { publicKey },
        select: { id: true, publicKey: true },
      });
      // Сообщаем активным сокетам других участников всех чатов юзера, что ключ
      // сменился. Они должны re-fetch /chats чтобы взять свежий публичный ключ.
      const io = req.app.get('io') as import('socket.io').Server | undefined;
      if (io) {
        const memberships = await prisma.chatMember.findMany({
          where: { userId, leftAt: null },
          select: { chatId: true, chat: { select: { members: { where: { leftAt: null }, select: { userId: true } } } } },
        });
        const peerIds = new Set<string>();
        memberships.forEach((m) => m.chat.members.forEach((p) => { if (p.userId !== userId) peerIds.add(p.userId); }));
        peerIds.forEach((pid) => io.to(`user:${pid}`).emit('user:key-changed', { userId, publicKey }));
      }
      sendSuccess(res, user);
    } catch (err) { next(err); }
  },
);

// PUT /users/me/cloud-password — установить/сменить облачный пароль.
// Если пароль уже стоит — currentPassword обязателен и проверяется.
router.put('/me/cloud-password',
  requireAuth,
  validate([
    body('currentPassword').optional().isString().isLength({ min: 1, max: 128 }),
    body('newPassword').isString().isLength({ min: 8, max: 128 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword: string };

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { cloudPasswordHash: true },
      });
      if (user?.cloudPasswordHash) {
        if (!currentPassword) {
          throw new AppError(400, 'CURRENT_PASSWORD_REQUIRED', 'Current password is required to change it');
        }
        const valid = await argon2.verify(user.cloudPasswordHash, currentPassword);
        if (!valid) throw new AppError(401, 'WRONG_PASSWORD', 'Current password is wrong');
      }

      const cloudPasswordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);
      await prisma.user.update({ where: { id: userId }, data: { cloudPasswordHash } });
      sendSuccess(res, { cloudPasswordSet: true });
    } catch (err) { next(err); }
  },
);

// DELETE /users/me/cloud-password — снять облачный пароль (с проверкой текущего).
router.delete('/me/cloud-password',
  requireAuth,
  validate([
    body('currentPassword').isString().isLength({ min: 1, max: 128 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { currentPassword } = req.body as { currentPassword: string };

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { cloudPasswordHash: true },
      });
      if (!user?.cloudPasswordHash) {
        throw new AppError(400, 'CLOUD_PASSWORD_NOT_SET', 'Cloud password is not set');
      }
      const valid = await argon2.verify(user.cloudPasswordHash, currentPassword);
      if (!valid) throw new AppError(401, 'WRONG_PASSWORD', 'Current password is wrong');

      await prisma.user.update({ where: { id: userId }, data: { cloudPasswordHash: null } });
      sendSuccess(res, { cloudPasswordSet: false });
    } catch (err) { next(err); }
  },
);

// ─── Приватность ──────────────────────────────────────────────────────────────

// GET /users/me/privacy — текущие настройки приватности
router.get('/me/privacy',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { lastSeenVisibility: true, readReceiptsEnabled: true },
      });
      if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
      sendSuccess(res, user);
    } catch (err) { next(err); }
  },
);

// PATCH /users/me/privacy { lastSeenVisibility?, readReceiptsEnabled? }
router.patch('/me/privacy',
  requireAuth,
  validate([
    body('lastSeenVisibility').optional().isIn(['everyone', 'nobody']),
    body('readReceiptsEnabled').optional().isBoolean(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { lastSeenVisibility, readReceiptsEnabled } = req.body as {
        lastSeenVisibility?: 'everyone' | 'nobody'; readReceiptsEnabled?: boolean;
      };
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(lastSeenVisibility !== undefined && { lastSeenVisibility }),
          ...(readReceiptsEnabled !== undefined && { readReceiptsEnabled: readReceiptsEnabled === true }),
        },
        select: { lastSeenVisibility: true, readReceiptsEnabled: true },
      });
      sendSuccess(res, user);
    } catch (err) { next(err); }
  },
);

// POST /users/:id/block — заблокировать юзера
router.post('/:id/block',
  requireAuth,
  validate([param('id').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const targetId = req.params.id;
      if (userId === targetId) {
        res.status(400).json({ success: false, error: { code: 'SELF_BLOCK', message: 'Cannot block yourself' } });
        return;
      }
      const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!target) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }); return; }

      await prisma.contact.upsert({
        where: { ownerId_targetId: { ownerId: userId, targetId } },
        create: { ownerId: userId, targetId, blocked: true },
        update: { blocked: true },
      });
      sendSuccess(res, { blocked: true });
    } catch (err) { next(err); }
  },
);

// Снятие блока — общий обработчик для POST /:id/unblock (legacy) и DELETE /:id/block
async function unblockHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const targetId = req.params.id;
    await prisma.contact.updateMany({
      where: { ownerId: userId, targetId },
      data: { blocked: false },
    });
    sendSuccess(res, { blocked: false });
  } catch (err) { next(err); }
}

// POST /users/:id/unblock — снять блок (legacy)
router.post('/:id/unblock',
  requireAuth,
  validate([param('id').notEmpty()]),
  unblockHandler,
);

// DELETE /users/:id/block — снять блок
router.delete('/:id/block',
  requireAuth,
  validate([param('id').notEmpty()]),
  unblockHandler,
);

// Список заблокированных — общий обработчик для GET /me/blocks (legacy) и /me/blocked
async function blockedListHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const blocks = await prisma.contact.findMany({
      where: { ownerId: userId, blocked: true },
      select: {
        target: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });
    sendSuccess(res, blocks.map((b) => b.target));
  } catch (err) { next(err); }
}

// GET /users/me/blocks — список заблокированных (legacy)
router.get('/me/blocks', requireAuth, blockedListHandler);

// GET /users/me/blocked — список заблокированных
router.get('/me/blocked', requireAuth, blockedListHandler);

// DELETE /users/me { password? } — удаление аккаунта (soft-delete).
// Если стоит облачный пароль — он обязателен. PII затирается, аккаунт остаётся
// рядом строкой для целостности сообщений/чатов. Все сессии убиваются.
router.delete('/me',
  requireAuth,
  validate([body('password').optional().isString().isLength({ min: 1, max: 128 })]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { password } = req.body as { password?: string };

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { cloudPasswordHash: true },
      });
      if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

      if (user.cloudPasswordHash) {
        if (!password) throw new AppError(401, 'WRONG_PASSWORD', 'Password required to delete account');
        const valid = await argon2.verify(user.cloudPasswordHash, password);
        if (!valid) throw new AppError(401, 'WRONG_PASSWORD', 'Wrong password');
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          phone: null,
          username: null,
          displayName: 'Удалённый аккаунт',
          avatar: null,
          bio: null,
          publicKey: null,
          cloudPasswordHash: null,
        },
      });
      // Refresh умирает на всех устройствах
      await prisma.session.deleteMany({ where: { userId } });

      sendSuccess(res, { deleted: true });
    } catch (err) { next(err); }
  },
);

// POST /users/me/avatar — upload avatar
// Поле формы — 'file' (единая конвенция со всей медиа-загрузкой; фронт шлёт 'file').
router.post('/me/avatar',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) { res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'Avatar file required' } }); return; }
      const { userId } = req as AuthRequest;
      const ext = req.file.mimetype.split('/')[1] ?? 'jpg';
      const objectName = generateObjectName(userId, 'avatar', ext);
      const url = await uploadFile(objectName, req.file.buffer, req.file.mimetype, req.file.size);
      const user = await prisma.user.update({ where: { id: userId }, data: { avatar: url }, select: { avatar: true } });
      sendSuccess(res, user);
    } catch (err) { next(err); }
  },
);

export default router;
