/**
 * LiveKit token endpoint — выдача JWT-токена для подключения к SFU.
 *
 * Используется ТОЛЬКО для групповых звонков (до 8 участников). 1-на-1 звонки
 * идут через прямой peer-to-peer WebRTC (см. webrtc.routes.ts + CallOverlay),
 * чтобы избежать relay-latency на двух участников.
 *
 * Поток:
 *   1. Клиент (group-chat header) жмёт "Групповой звонок"
 *   2. POST /api/livekit/token { chatId }
 *   3. Backend проверяет: chat.type === 'group', user — член чата, livekit настроен
 *   4. Backend подписывает AccessToken через livekit-server-sdk и возвращает
 *      { token, url } — клиент использует это для new Room().connect(url, token)
 *
 * ── Интеграция мобильных клиентов (НЕ в скоупе этого таска) ──────────────────
 * iOS/Android запрашивают токен ИДЕНТИЧНО — POST /api/livekit/token с тем же
 * body. Дальше подключаются через нативные SDK:
 *   • iOS:     https://github.com/livekit/client-sdk-swift     (SwiftPM)
 *   • Android: https://github.com/livekit/client-sdk-android   (Maven)
 * Оба SDK имеют тот же интерфейс: Room().connect(url, token).
 */
import { Router, Request, Response, NextFunction } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { sendSuccess, AppError } from '../utils/response';
import { config } from '../config';

const router = Router();

// TTL токена — 4 часа. Достаточно для длинного созвона, но не вечно.
const TOKEN_TTL_SEC = 4 * 60 * 60;

// POST /api/livekit/token  body { chatId }
router.post('/token',
  requireAuth,
  validate([body('chatId').isString().notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { chatId } = req.body as { chatId: string };

      // 503 если LiveKit не настроен оператором (env пуст).
      // Клиент в этом случае просто не показывает кнопку группового звонка.
      if (!config.livekit.apiKey || !config.livekit.apiSecret || !config.livekit.url) {
        throw new AppError(503, 'LIVEKIT_DISABLED', 'LiveKit is not configured on this server');
      }

      // Проверка членства + типа чата (только group)
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
        include: {
          chat:  { select: { type: true } },
          user:  { select: { displayName: true, username: true } },
        },
      });
      if (!member || member.leftAt) {
        throw new AppError(403, 'FORBIDDEN', 'You are not a member of this chat');
      }
      if (member.chat.type !== 'group') {
        throw new AppError(400, 'NOT_GROUP_CHAT', 'LiveKit calls are only available in group chats');
      }

      const roomName = `chat-${chatId}`;

      const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
        identity: userId,
        name: member.user.displayName ?? member.user.username ?? undefined,
        ttl: TOKEN_TTL_SEC,
      });

      at.addGrant({
        room: roomName,
        roomJoin:     true,
        canPublish:   true,
        canSubscribe: true,
        // canPublishData нужен для пересылки текстовых сигналов (raise hand и т.п.)
        canPublishData: true,
      });

      const token = await at.toJwt();

      sendSuccess(res, {
        token,
        url:  config.livekit.url,
        room: roomName,
      });
    } catch (err) { next(err); }
  },
);

export default router;
