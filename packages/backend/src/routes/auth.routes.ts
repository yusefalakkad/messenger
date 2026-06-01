import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
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
  completeProfile, completeProfileValidators,
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
router.post('/phone/complete-profile',  authLimiter, validate(completeProfileValidators), completeProfile);

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

export default router;
