import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { sendSuccess, AppError } from '../utils/response';
import { getPublicKey, saveSubscription, removeSubscription } from '../lib/push';
import { redis } from '../lib/redis';

const router = Router();

// GET /push/public-key
router.get('/public-key', requireAuth, (_req: Request, res: Response) => {
  const key = getPublicKey();
  if (!key) {
    res.status(503).json({ success: false, error: { code: 'PUSH_DISABLED', message: 'Push not configured' } });
    return;
  }
  sendSuccess(res, { publicKey: key });
});

// POST /push/subscribe
router.post('/subscribe',
  requireAuth,
  validate([
    body('subscription.endpoint').isString().notEmpty(),
    body('subscription.keys.p256dh').isString().notEmpty(),
    body('subscription.keys.auth').isString().notEmpty(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { subscription } = req.body;
      await saveSubscription(userId, subscription);
      sendSuccess(res, { ok: true });
    } catch (err) { next(err); }
  },
);

// POST /push/unsubscribe
router.post('/unsubscribe',
  requireAuth,
  validate([body('endpoint').isString().notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { endpoint } = req.body;
      await removeSubscription(userId, endpoint);
      sendSuccess(res, { ok: true });
    } catch (err) { next(err); }
  },
);

// POST /push/native-token  — для iOS/Android (Capacitor)
// Сохраняем APNs/FCM-токен в Redis по ключу push:native:<userId>
router.post('/native-token',
  requireAuth,
  validate([
    body('token').isString().notEmpty(),
    body('platform').isIn(['ios', 'android']),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { token, platform } = req.body as { token: string; platform: 'ios' | 'android' };
      await redis.sadd(`push:native:${userId}`, JSON.stringify({ token, platform, at: Date.now() }));
      sendSuccess(res, { ok: true });
    } catch (err) { next(err); }
  },
);

export default router;
