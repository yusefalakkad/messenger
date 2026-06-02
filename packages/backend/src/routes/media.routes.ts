import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { uploadFile, generateObjectName, getObjectStream, statObject } from '../lib/minio';
import { verifyAccessToken, verifyRefreshToken } from '../utils/jwt';
import { prisma } from '../lib/prisma';
import { sendSuccess, AppError } from '../utils/response';
import { config } from '../config';

const router = Router();

// Извлекает userId из Authorization Bearer или из httpOnly cookie refreshToken.
// Cookie нужен для <img src="/api/media/..."> — браузер сам шлёт его, header добавить нельзя.
function authenticateMediaRequest(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try { return verifyAccessToken(auth.slice(7)).sub; } catch { /* fall through */ }
  }
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.refreshToken;
  if (cookieToken) {
    try { return verifyRefreshToken(cookieToken).sub; } catch { /* fall through */ }
  }
  return null;
}

type MediaType = 'image' | 'video' | 'voice' | 'circle' | 'file';
const MEDIA_TYPES: readonly MediaType[] = ['image', 'video', 'voice', 'circle', 'file'];

// Configure multer for different media types
function createUpload(type: MediaType) {
  const limits: Record<MediaType, number> = {
    image: config.upload.maxImageSize,
    video: config.upload.maxVideoSize,
    voice: config.upload.maxVoiceSize,
    circle: config.upload.maxVideoSize,
    file:  config.upload.maxFileSize,
  };
  const allowed: Record<MediaType, readonly string[] | null> = {
    image: config.upload.allowedImageTypes,
    video: config.upload.allowedVideoTypes,
    voice: config.upload.allowedVoiceTypes,
    circle: config.upload.allowedVideoTypes,
    file:  null, // file = любой MIME (юзер прикрепляет произвольный документ)
  };

  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: limits[type] },
    fileFilter: (_req, file, cb) => {
      const mime = file.mimetype.split(';')[0].trim();
      if (type === 'circle' && mime.startsWith('video/')) { cb(null, true); return; }
      if (type === 'file') { cb(null, true); return; }
      const list = allowed[type];
      if (list && list.includes(mime)) cb(null, true);
      else cb(new Error(`Invalid file type for ${type}`));
    },
  });
}

// POST /media/upload/:type
router.post('/upload/:type',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    const type = req.params.type as MediaType;
    if (!MEDIA_TYPES.includes(type)) {
      throw new AppError(400, 'INVALID_TYPE', 'Invalid media type');
    }
    createUpload(type).single('file')(req, res, next);
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError(400, 'NO_FILE', 'File required');

      const { userId } = req as AuthRequest;
      const type = req.params.type as MediaType;
      const baseMime = req.file.mimetype.split(';')[0].trim();
      const ext = path.extname(req.file.originalname).slice(1) || baseMime.split('/')[1];
      const objectName = generateObjectName(userId, type, ext);

      const url = await uploadFile(objectName, req.file.buffer, req.file.mimetype, req.file.size);

      // Parse optional metadata from body
      const metadata = {
        width: req.body.width ? parseInt(req.body.width) : undefined,
        height: req.body.height ? parseInt(req.body.height) : undefined,
        duration: req.body.duration ? parseFloat(req.body.duration) : undefined,
        waveform: req.body.waveform ? JSON.parse(req.body.waveform) : undefined,
      };

      sendSuccess(res, {
        url,
        objectName,
        mimeType: req.file.mimetype.split(';')[0].trim(),
        size: req.file.size,
        ...metadata,
      }, 201);
    } catch (err) { next(err); }
  },
);

// GET /media/*objectName — отдача медиа с проверкой прав.
// Аватары — доступны любому авторизованному. Медиа в сообщениях — только участникам чата.
router.get(/^\/(.+)$/, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = authenticateMediaRequest(req);
    if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');

    const objectName = req.params[0];
    if (!objectName || objectName.includes('..') || objectName.startsWith('/')) {
      throw new AppError(400, 'BAD_PATH', 'Invalid object path');
    }

    // Аватары всегда видимы залогиненным юзерам (имя файла = avatar/...).
    // Для остального — проверка членства в чате.
    if (!objectName.startsWith('avatar/')) {
      const url = `/api/media/${objectName}`;
      const media = await prisma.media.findFirst({
        where: { OR: [{ url }, { thumbnailUrl: url }] },
        select: { message: { select: { chatId: true } } },
      });
      if (!media) throw new AppError(404, 'NOT_FOUND', 'Media not found');
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId: media.message.chatId, userId } },
        select: { id: true },
      });
      if (!member) throw new AppError(403, 'FORBIDDEN', 'Not a chat member');
    }

    const stat = await statObject(objectName).catch(() => null);
    if (!stat) throw new AppError(404, 'NOT_FOUND', 'Object not found');

    res.setHeader('Content-Type', stat.metaData?.['content-type'] ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'private, max-age=604800, immutable');

    const stream = await getObjectStream(objectName);
    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).end();
      next(err);
    });
    stream.pipe(res);
  } catch (err) { next(err); }
});

export default router;
