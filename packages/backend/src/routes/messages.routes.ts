import { Router, Request, Response, NextFunction } from 'express';
import { Server as SocketServer } from 'socket.io';
import { param } from 'express-validator';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { sendSuccess, AppError } from '../utils/response';
import { deleteFile, extractObjectName } from '../lib/minio';
import { logger } from '../lib/logger';

// Одноразовые медиа («1×»): получатель отмечает просмотр — медиа удаляется навсегда.
// Монтируется на /messages рядом со schedule.routes (пути не пересекаются).
const router = Router();

// POST /messages/:messageId/view — отметить одноразовое медиа просмотренным.
// Только участник чата, не отправитель, ещё не просмотрено. После отметки
// файлы удаляются из MinIO (основной + превью) и запись Media стирается.
router.post('/:messageId/view',
  requireAuth,
  validate([param('messageId').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { messageId } = req.params;

      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true, chatId: true, senderId: true,
          viewOnce: true, viewedAt: true, deletedAt: true,
          media: { select: { id: true, url: true, thumbnailUrl: true } },
        },
      });
      if (!message || message.deletedAt) throw new AppError(404, 'NOT_FOUND', 'Message not found');

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId: message.chatId, userId } },
        select: { leftAt: true },
      });
      if (!member || member.leftAt) throw new AppError(403, 'FORBIDDEN', 'Not a member of this chat');

      if (!message.viewOnce) throw new AppError(400, 'NOT_VIEW_ONCE', 'Message is not view-once');
      if (message.senderId === userId) throw new AppError(400, 'OWN_MESSAGE', 'Sender cannot consume own view-once media');

      // Атомарный guard от двойного просмотра (две вкладки / гонка запросов):
      // updateMany с viewedAt: null — второй запрос получит count 0.
      const updated = await prisma.message.updateMany({
        where: { id: messageId, viewedAt: null },
        data: { viewedAt: new Date() },
      });
      if (updated.count === 0) throw new AppError(409, 'ALREADY_VIEWED', 'Message already viewed');

      // Удаляем медиа навсегда: объекты в MinIO и запись Media.
      // extractObjectName вернёт null для внешних URL (Tenor) — такие скипаем.
      if (message.media) {
        for (const url of [message.media.url, message.media.thumbnailUrl]) {
          if (!url) continue;
          const objectName = extractObjectName(url);
          if (!objectName) continue;
          try {
            await deleteFile(objectName);
          } catch (err) {
            // viewedAt уже стоит — не валим запрос из-за недоудалённого файла
            logger.warn('view-once media delete failed', { err: (err as Error).message, objectName });
          }
        }
        await prisma.media.delete({ where: { id: message.media.id } }).catch(() => {
          // запись могла исчезнуть в гонке — не критично
        });
      }

      const io = req.app.get('io') as SocketServer | undefined;
      io?.to(`chat:${message.chatId}`).emit('message:viewed', { chatId: message.chatId, messageId });

      sendSuccess(res, { viewed: true });
    } catch (err) { next(err); }
  },
);

export default router;
