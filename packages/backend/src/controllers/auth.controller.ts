import { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import argon2 from 'argon2';
import { authService } from '../services/auth.service';
import { sendSuccess, AppError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import {
  generateSecret, provisioningUri, verifyTotp,
  generateRecoveryCodes, hashRecoveryCode,
} from '../lib/twofa';

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
      sameSite: 'strict',
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

    if (result.kind === '2fa-required') {
      sendSuccess(res, { twoFactorRequired: true, twoFactorToken: result.twoFactorToken });
      return;
    }

    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: !config.isDev,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    sendSuccess(res, { user: result.user, tokens: result.tokens });
  } catch (err) {
    next(err);
  }
}

// ─── 2FA: финальный шаг логина ────────────────────────────────────────────────

export const loginTwoFactorValidators = [
  body('twoFactorToken').notEmpty().withMessage('twoFactorToken required'),
  body('code').trim().notEmpty().withMessage('Code required'),
];

export async function loginTwoFactor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.verifyTwoFactor({
      twoFactorToken: req.body.twoFactorToken,
      code:           req.body.code,
      ipAddress:      req.ip,
      userAgent:      req.headers['user-agent'],
    });

    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: !config.isDev,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    sendSuccess(res, { user: result.user, tokens: result.tokens });
  } catch (err) { next(err); }
}

// ─── 2FA: setup/enable/disable (внутри авторизованного интерфейса) ────────────

// POST /auth/2fa/setup — генерирует секрет, возвращает provisioning URI для QR
export async function twoFactorSetup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, username } = req as AuthRequest;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } });
    if (user?.twoFactorEnabled) throw new AppError(400, '2FA_ALREADY_ENABLED', '2FA is already enabled');

    const secret = generateSecret();
    // Сохраняем pending-секрет в БД, но не помечаем как enabled.
    await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: secret } });

    sendSuccess(res, {
      secret,
      otpauthUrl: provisioningUri(username, secret),
    });
  } catch (err) { next(err); }
}

// POST /auth/2fa/enable — подтверждает код из приложения, включает 2FA, возвращает recovery codes
export const twoFactorEnableValidators = [
  body('code').trim().isLength({ min: 6, max: 8 }),
];
export async function twoFactorEnable(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user?.twoFactorSecret) throw new AppError(400, '2FA_NOT_SETUP', 'Run /2fa/setup first');
    if (user.twoFactorEnabled) throw new AppError(400, '2FA_ALREADY_ENABLED', 'Already enabled');

    if (!verifyTotp(user.twoFactorSecret, req.body.code)) {
      throw new AppError(401, 'INVALID_2FA_CODE', 'Invalid code — check time & try again');
    }

    const recoveryCodes = generateRecoveryCodes();
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorRecovery: recoveryCodes.map(hashRecoveryCode),
      },
    });

    // Recovery-коды показываются ТОЛЬКО здесь, на сервере хранятся только хеши.
    sendSuccess(res, { enabled: true, recoveryCodes });
  } catch (err) { next(err); }
}

// POST /auth/2fa/disable — требует и пароль, и текущий TOTP-код
export const twoFactorDisableValidators = [
  body('password').notEmpty(),
  body('code').trim().isLength({ min: 6, max: 8 }),
];
export async function twoFactorDisable(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, twoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      throw new AppError(400, '2FA_NOT_ENABLED', '2FA is not enabled');
    }

    const validPassword = await argon2.verify(user.passwordHash, req.body.password);
    if (!validPassword) throw new AppError(401, 'INVALID_PASSWORD', 'Wrong password');

    if (!verifyTotp(user.twoFactorSecret, req.body.code)) {
      throw new AppError(401, 'INVALID_2FA_CODE', 'Invalid 2FA code');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecovery: [] },
    });
    sendSuccess(res, { enabled: false });
  } catch (err) { next(err); }
}

// GET /auth/2fa/status — проверить включён ли 2FA для текущего юзера
export async function twoFactorStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, twoFactorRecovery: true } });
    sendSuccess(res, {
      enabled: !!user?.twoFactorEnabled,
      remainingRecoveryCodes: user?.twoFactorRecovery.length ?? 0,
    });
  } catch (err) { next(err); }
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
    res.clearCookie('refreshToken', { path: '/', sameSite: 'strict' });
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
