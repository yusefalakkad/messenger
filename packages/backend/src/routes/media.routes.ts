import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { uploadFile, generateObjectName, getObjectStream, statObject } from '../lib/minio';
import { verifyAccessToken, verifyRefreshToken } from '../utils/jwt';
import { verifyMediaToken } from '../lib/mediaToken';
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
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: limits[type] },
    // НЕТ fileFilter — multer не отвергает по MIME. Размер контролирует limits.
    // Браузеры/SDK дают непредсказуемые MIME-строки (codecs, charsets, octet-stream
    // при empty blob.type), MIME-whitelist гарантированно ловит false positives.
    // Если нужно ограничить — лучше проверка magic-bytes (file-type) в handler.
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
    // Оборачиваем multer чтобы fileFilter/limit ошибки превращались в 400, а не 500.
    createUpload(type).single('file')(req, res, (err) => {
      if (err) {
        const code = (err as { code?: string }).code || 'UPLOAD_FAILED';
        // Multer's own LIMIT_FILE_SIZE / Custom BAD_FILE_TYPE / etc — всё в 400
        const status = code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return next(new AppError(status, code, (err as Error).message || 'Upload failed'));
      }
      next();
    });
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
//
// Авторизация в порядке приоритета:
//  1) `?t=<hmac>` query — HMAC-подпись от backend (для <img>/<video>, native).
//     Подпись означает, что backend намеренно выдал доступ. Дополнительной
//     проверки членства в чате не делаем (telegram-like модель: anyone-with-URL).
//  2) Bearer header / refreshToken cookie — для axios-запросов и SSR.
//     В этом случае проверяем членство в чате для не-аватарных файлов.
router.get(/^\/(.+)$/, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const objectName = req.params[0];
    if (!objectName || objectName.includes('..') || objectName.startsWith('/')) {
      throw new AppError(400, 'BAD_PATH', 'Invalid object path');
    }

    const queryToken = typeof req.query.t === 'string' ? req.query.t : null;
    const tokenValid = queryToken ? verifyMediaToken(queryToken, objectName) : false;

    if (!tokenValid) {
      // Fallback: классическая авторизация для случаев, когда клиент тянет
      // медиа через axios (например, скачивание файла) и подпись ещё не успели
      // подставить, или для старых клиентов.
      const userId = authenticateMediaRequest(req);
      if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');

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
    }

    const stat = await statObject(objectName).catch(() => null);
    if (!stat) throw new AppError(404, 'NOT_FOUND', 'Object not found');

    // SECURITY: медиа отдаётся с того же origin, что и SPA. Нельзя позволить
    // браузеру исполнить залитый html/svg как документ (stored XSS). Жёстко
    // фиксируем тип: безопасные media-типы → inline; всё остальное (включая
    // text/html, image/svg+xml) → octet-stream + attachment + nosniff.
    const SAFE_INLINE_TYPES = new Set([
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
      'image/heic', 'image/heif',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
      'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/webm',
      'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a',
    ]);
    const storedType = (stat.metaData?.['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const inlineSafe = SAFE_INLINE_TYPES.has(storedType);
    res.setHeader('Content-Type', inlineSafe ? storedType : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', inlineSafe ? 'inline' : 'attachment');
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
