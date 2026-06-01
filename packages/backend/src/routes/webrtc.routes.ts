/**
 * WebRTC helper endpoints — раздача ICE-серверов.
 *
 * SECURITY: TURN credentials НЕ статичные. Используем стандартную схему
 * coturn REST API:
 *   username   = "<unixTimestampExpiry>:<userId>"
 *   credential = base64( HMAC-SHA1( TURN_SECRET, username ) )
 *
 * coturn должен быть запущен с флагами:
 *   --use-auth-secret --static-auth-secret=$TURN_SECRET
 *
 * Преимущества:
 *   • Каждый клиент получает свои credentials, привязанные к его userId
 *   • TTL ~10 минут — даже если creds утекут, они быстро устаревают
 *   • Можно ревочить пользователя через blacklist в coturn (auth_secret rotation)
 *   • Long-term secret (TURN_SECRET) знает только сервер + coturn, никогда не уходит к клиенту
 */
import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { sendSuccess } from '../utils/response';

const router = Router();

interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

const TURN_TTL_SEC = 600; // 10 минут

// GET /webrtc/ice-servers
router.get('/ice-servers', requireAuth, (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;

  const servers: IceServer[] = [
    {
      // Public Google STUN на случай если наш TURN недоступен
      urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
    },
  ];

  // Наш TURN, если настроен
  const turnDomain = process.env.TURN_DOMAIN || process.env.SERVER_IP;
  const turnSecret = process.env.TURN_SECRET;

  if (turnDomain && turnSecret) {
    const { username, credential } = generateTurnCredentials(userId, turnSecret, TURN_TTL_SEC);
    servers.push({
      urls: [
        `turn:${turnDomain}:3478?transport=udp`,
        `turn:${turnDomain}:3478?transport=tcp`,
        `turns:${turnDomain}:5349?transport=tcp`, // TLS
      ],
      username,
      credential,
    });
  } else if (turnDomain && process.env.TURN_USER && process.env.TURN_PASS) {
    // ── ЛЕГАСИ: статичные credentials. Оставлено для backward-compat пока
    // coturn не переключён на --use-auth-secret. УДАЛИТЬ после миграции.
    servers.push({
      urls: [
        `turn:${turnDomain}:3478?transport=udp`,
        `turn:${turnDomain}:3478?transport=tcp`,
      ],
      username: process.env.TURN_USER,
      credential: process.env.TURN_PASS,
    });
  }

  sendSuccess(res, { iceServers: servers });
});

/**
 * Генерирует REST-credentials для coturn.
 * Формат описан в IETF draft-uberti-behave-turn-rest-00.
 */
function generateTurnCredentials(
  userId: string,
  staticAuthSecret: string,
  ttlSec: number,
): { username: string; credential: string } {
  const expiry = Math.floor(Date.now() / 1000) + ttlSec;
  // coturn распознает "<expiry>:<arbitrary>" — мы вписываем userId для трейсинга
  const username = `${expiry}:${userId}`;
  const hmac = crypto.createHmac('sha1', staticAuthSecret);
  hmac.update(username);
  const credential = hmac.digest('base64');
  return { username, credential };
}

export default router;
