import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { isUserOnline } from '../lib/redis';
import { sendSuccess } from '../utils/response';
import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { uploadFile, generateObjectName } from '../lib/minio';
import { config } from '../config';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxImageSize },
  fileFilter: (_req, file, cb) => {
    if (config.upload.allowedImageTypes.includes(file.mimetype)) {
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
      const users = await prisma.user.findMany({
        where: {
          deletedAt: null,
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
            { phone: q },
          ],
          NOT: { id: (req as AuthRequest).userId },
        },
        select: { id: true, username: true, displayName: true, avatar: true, bio: true, publicKey: true },
        take: 20,
      });
      sendSuccess(res, users);
    } catch (err) { next(err); }
  },
);

// GET /users/:id
router.get('/:id',
  requireAuth,
  validate([param('id').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id, deletedAt: null },
        select: { id: true, username: true, displayName: true, avatar: true, bio: true, status: true, lastSeenAt: true, publicKey: true, createdAt: true },
      });
      if (!user) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }); return; }
      const online = await isUserOnline(user.id);
      sendSuccess(res, { ...user, status: online ? 'online' : 'offline' });
    } catch (err) { next(err); }
  },
);

// PATCH /users/me — update profile
router.patch('/me',
  requireAuth,
  validate([
    body('displayName').optional().trim().isLength({ min: 1, max: 64 }),
    body('bio').optional().trim().isLength({ max: 300 }),
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

// POST /users/me/avatar — upload avatar
router.post('/me/avatar',
  requireAuth,
  upload.single('avatar'),
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
