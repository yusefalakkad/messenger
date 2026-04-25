import { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authService } from '../services/auth.service';
import { sendSuccess } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { config } from '../config';

// ─── Validators ───────────────────────────────────────────────────────────────

export const registerValidators = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 32 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username: 3-32 chars, letters/numbers/underscores only'),
  body('displayName')
    .trim()
    .isLength({ min: 1, max: 64 })
    .withMessage('Display name required (max 64 chars)'),
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters'),
  body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Invalid email'),
  body('publicKey').notEmpty().withMessage('Public key required (E2E encryption)'),
];

export const loginValidators = [
  body('login').trim().notEmpty().withMessage('Login required'),
  body('password').notEmpty().withMessage('Password required'),
  body('deviceId').notEmpty().withMessage('Device ID required'),
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.register(req.body);

    // Ставим refresh token cookie (как и при логине)
    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: !config.isDev,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login({
      ...req.body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Set refresh token as httpOnly cookie for web clients
    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: !config.isDev,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    });

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Try cookie first, then body (for mobile clients)
    const token = req.cookies?.refreshToken ?? req.body?.refreshToken;
    if (!token) {
      res.status(401).json({ success: false, error: { code: 'TOKEN_MISSING', message: 'Refresh token required' } });
      return;
    }

    const tokens = await authService.refreshTokens(token);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: !config.isDev,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    sendSuccess(res, { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.refreshToken ?? req.body?.refreshToken;
    if (token) {
      await authService.logout(token, (req as AuthRequest).userId);
    }
    res.clearCookie('refreshToken', { path: '/', sameSite: 'lax' });
    sendSuccess(res);
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    // Imported lazily to avoid circular deps
    const { prisma } = await import('../lib/prisma');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, displayName: true,
        avatar: true, bio: true, status: true,
        phone: true, email: true, publicKey: true,
        createdAt: true,
      },
    });
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}
