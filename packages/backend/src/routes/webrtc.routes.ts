/**
 * WebRTC helper endpoints — пока только раздача ICE-серверов.
 *
 * Зачем: пароль TURN-сервера нельзя зашивать в бинарь iOS-приложения.
 * Клиент запрашивает /webrtc/ice-servers перед каждым звонком,
 * получает свежие credentials.
 */
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { sendSuccess } from '../utils/response';

const router = Router();

interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

// GET /webrtc/ice-servers
router.get('/ice-servers', requireAuth, (_req: Request, res: Response) => {
  const servers: IceServer[] = [
    {
      // Public Google STUN на случай если наш TURN недоступен
      urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
    },
  ];

  // Наш TURN, если настроен
  const turnDomain = process.env.TURN_DOMAIN || process.env.SERVER_IP;
  const turnUser   = process.env.TURN_USER;
  const turnPass   = process.env.TURN_PASS;

  if (turnDomain && turnUser && turnPass) {
    servers.push({
      urls: [
        `turn:${turnDomain}:3478?transport=udp`,
        `turn:${turnDomain}:3478?transport=tcp`,
      ],
      username: turnUser,
      credential: turnPass,
    });
  }

  sendSuccess(res, { iceServers: servers });
});

export default router;
