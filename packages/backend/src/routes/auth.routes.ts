import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, query } from 'express-validator';
import { config } from '../config';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { sendSuccess, AppError } from '../utils/response';
import {
  register, registerValidators,
  login, loginValidators,
  loginTwoFactor, loginTwoFactorValidators,
  twoFactorSetup, twoFactorEnable, twoFactorEnableValidators,
  twoFactorDisable, twoFactorDisableValidators, twoFactorStatus,
  refresh, logout, me,
} from '../controllers/auth.controller';
import {
  requestCode, requestCodeValidators,
  verifyCode, verifyCodeValidators,
  verifyCloudPassword, verifyCloudPasswordValidators,
  completeProfile, completeProfileValidators,
  changePhoneRequest, changePhoneRequestValidators,
  changePhoneConfirm, changePhoneConfirmValidators,
} from '../controllers/phoneAuth.controller';

const router = Router();

// Strict rate limit for auth endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// /refresh обычно вызывается чаще, чем login (каждые 15 мин access token), но не должен быть открыт для bruteforce.
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many refresh attempts' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Phone-OTP auth (новый основной флоу) ─────────────────────────────────────
router.post('/phone/request',           authLimiter, validate(requestCodeValidators),     requestCode);
router.post('/phone/verify',            authLimiter, validate(verifyCodeValidators),      verifyCode);
router.post('/phone/password',          authLimiter, validate(verifyCloudPasswordValidators), verifyCloudPassword);
router.post('/phone/complete-profile',  authLimiter, validate(completeProfileValidators), completeProfile);

// Смена номера телефона (требует авторизацию: меняет номер текущего аккаунта).
router.post('/phone/change/request', authLimiter, requireAuth, validate(changePhoneRequestValidators), changePhoneRequest);
router.post('/phone/change/confirm', authLimiter, requireAuth, validate(changePhoneConfirmValidators), changePhoneConfirm);

// ─── Legacy email/password (deprecated, для миграции) ─────────────────────────
router.post('/register',     authLimiter,    validate(registerValidators), register);
router.post('/login',        authLimiter,    validate(loginValidators), login);
router.post('/login/2fa',    authLimiter,    validate(loginTwoFactorValidators), loginTwoFactor);
router.post('/refresh',      refreshLimiter, refresh);
router.post('/logout',       requireAuth,    logout);
router.get('/me',            requireAuth,    me);

// 2FA management (requires existing auth)
router.get('/2fa/status',    requireAuth, twoFactorStatus);
router.post('/2fa/setup',    requireAuth, twoFactorSetup);
router.post('/2fa/enable',   requireAuth, validate(twoFactorEnableValidators), twoFactorEnable);
router.post('/2fa/disable',  requireAuth, validate(twoFactorDisableValidators), twoFactorDisable);

// ─── Активные сессии (устройства) ─────────────────────────────────────────────

// GET /auth/sessions?deviceId= — список моих сессий. isCurrent определяем по
// deviceId текущего устройства (клиент передаёт свой deviceId query-параметром).
router.get('/sessions',
  requireAuth,
  validate([query('deviceId').optional().isString().isLength({ max: 128 })]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const currentDeviceId = (req.query.deviceId as string | undefined) ?? null;

      const sessions = await prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, deviceId: true, deviceName: true,
          ipAddress: true, userAgent: true, createdAt: true,
        },
      });
      // refreshToken не селектим — наружу не отдаём
      sendSuccess(res, sessions.map((s) => ({
        ...s,
        isCurrent: currentDeviceId !== null && s.deviceId === currentDeviceId,
      })));
    } catch (err) { next(err); }
  },
);

// DELETE /auth/sessions/:id — завершить конкретную сессию (только свою).
// Удаление row делает refresh token мёртвым — устройство разлогинится.
router.delete('/sessions/:id',
  requireAuth,
  validate([param('id').notEmpty()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      // deleteMany с userId-фильтром — нельзя убить чужую сессию по id
      const result = await prisma.session.deleteMany({
        where: { id: req.params.id, userId },
      });
      if (result.count === 0) throw new AppError(404, 'NOT_FOUND', 'Session not found');
      sendSuccess(res, { terminated: true });
    } catch (err) { next(err); }
  },
);

// POST /auth/sessions/terminate-others { deviceId } — завершить все сессии,
// кроме сессий текущего устройства.
router.post('/sessions/terminate-others',
  requireAuth,
  validate([body('deviceId').isString().notEmpty().isLength({ max: 128 })]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req as AuthRequest;
      const { deviceId } = req.body as { deviceId: string };
      const result = await prisma.session.deleteMany({
        where: { userId, deviceId: { not: deviceId } },
      });
      sendSuccess(res, { terminated: result.count });
    } catch (err) { next(err); }
  },
);

export default router;
