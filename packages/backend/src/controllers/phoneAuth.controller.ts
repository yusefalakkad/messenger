import { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { sendSuccess } from '../utils/response';
import { phoneAuthService } from '../services/phoneAuth.service';

function getDeviceMeta(req: Request) {
  return {
    deviceId: (req.body?.deviceId as string) || uuidv4(),
    deviceName: req.body?.deviceName as string | undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || undefined,
  };
}

// ─── POST /auth/phone/request — выдать OTP-код ────────────────────────────────
export const requestCodeValidators = [
  body('phone').trim().isString().isLength({ min: 5, max: 30 }),
];

export async function requestCode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { phone } = req.body;
    const result = await phoneAuthService.requestCode(phone);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

// ─── POST /auth/phone/verify — проверить код ──────────────────────────────────
export const verifyCodeValidators = [
  body('phone').trim().isString().isLength({ min: 5, max: 30 }),
  body('code').trim().isString().isLength({ min: 4, max: 10 }),
  body('deviceId').optional().isString().isLength({ min: 8, max: 128 }),
  body('deviceName').optional().isString().isLength({ max: 80 }),
  // Опциональный свежий publicKey — клиент шлёт при логине с нового устройства
  body('publicKey').optional().isString().isLength({ min: 32, max: 256 }),
];

export async function verifyCode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { phone, code, publicKey } = req.body;
    const meta = getDeviceMeta(req);
    const result = await phoneAuthService.verifyCode(phone, code, meta, publicKey);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

// ─── POST /auth/phone/password — облачный пароль после OTP ────────────────────
export const verifyCloudPasswordValidators = [
  body('passwordToken').isString().isLength({ min: 32, max: 128 }),
  body('password').isString().isLength({ min: 1, max: 128 }),
  body('deviceId').optional().isString().isLength({ min: 8, max: 128 }),
  body('deviceName').optional().isString().isLength({ max: 80 }),
];

export async function verifyCloudPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { passwordToken, password } = req.body;
    const meta = getDeviceMeta(req);
    const result = await phoneAuthService.verifyCloudPassword(passwordToken, password, meta);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

// ─── POST /auth/phone/complete-profile — для новых юзеров ─────────────────────
export const completeProfileValidators = [
  body('verifyToken').isString().isLength({ min: 32, max: 128 }),
  body('displayName').trim().isString().isLength({ min: 1, max: 64 }),
  body('username').optional({ checkFalsy: true }).isString()
    .matches(/^[a-z0-9_]{3,32}$/i)
    .withMessage('username must be 3-32 chars [a-z0-9_]'),
  body('publicKey').isString().isLength({ min: 32, max: 256 }),
  body('deviceId').optional().isString().isLength({ min: 8, max: 128 }),
  body('deviceName').optional().isString().isLength({ max: 80 }),
];

export async function completeProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { verifyToken, displayName, username, publicKey } = req.body;
    const meta = getDeviceMeta(req);
    const result = await phoneAuthService.completeProfile(
      verifyToken,
      { displayName, username, publicKey },
      meta,
    );
    sendSuccess(res, { user: result.user, tokens: { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresIn: result.expiresIn } });
  } catch (err) { next(err); }
}
