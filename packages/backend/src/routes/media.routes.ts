import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { uploadFile, generateObjectName } from '../lib/minio';
import { prisma } from '../lib/prisma';
import { sendSuccess, AppError } from '../utils/response';
import { config } from '../config';

const router = Router();

// Configure multer for different media types
function createUpload(type: 'image' | 'video' | 'voice' | 'circle') {
  const limits: Record<string, number> = {
    image: config.upload.maxImageSize,
    video: config.upload.maxVideoSize,
    voice: config.upload.maxVoiceSize,
    circle: config.upload.maxVideoSize,
  };
  const allowed: Record<string, readonly string[]> = {
    image: config.upload.allowedImageTypes,
    video: config.upload.allowedVideoTypes,
    voice: config.upload.allowedVoiceTypes,
    circle: config.upload.allowedVideoTypes,
  };

  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: limits[type] },
    fileFilter: (_req, file, cb) => {
      const mime = file.mimetype.split(';')[0].trim();
      // Кружки и видео — принимаем любой video/* тип
      if (type === 'circle' && mime.startsWith('video/')) { cb(null, true); return; }
      if (allowed[type].includes(mime)) cb(null, true);
      else cb(new Error(`Invalid file type for ${type}`));
    },
  });
}

// POST /media/upload/:type
router.post('/upload/:type',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    const type = req.params.type as 'image' | 'video' | 'voice' | 'circle';
    if (!['image', 'video', 'voice', 'circle'].includes(type)) {
      throw new AppError(400, 'INVALID_TYPE', 'Invalid media type');
    }
    createUpload(type).single('file')(req, res, next);
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError(400, 'NO_FILE', 'File required');

      const { userId } = req as AuthRequest;
      const type = req.params.type as 'image' | 'video' | 'voice' | 'circle';
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

export default router;
