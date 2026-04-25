import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  register, registerValidators,
  login, loginValidators,
  refresh, logout, me,
} from '../controllers/auth.controller';

const router = Router();

// Strict rate limit for auth endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authLimiter, validate(registerValidators), register);
router.post('/login',    authLimiter, validate(loginValidators), login);
router.post('/refresh',  refresh);
router.post('/logout',   requireAuth, logout);
router.get('/me',        requireAuth, me);

export default router;
