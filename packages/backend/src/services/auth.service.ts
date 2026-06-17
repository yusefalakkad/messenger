import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { redis, blacklistToken } from '../lib/redis';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import {
  signTwoFactorToken, verifyTwoFactorToken,
  verifyTotp, consumeRecoveryCode,
} from '../lib/twofa';
import { AppError } from '../utils/response';
import type { AuthTokens } from '@messenger/shared';

export type LoginResult =
  | { kind: 'tokens'; user: { id: string; username: string | null; displayName: string | null; avatar: string | null }; tokens: AuthTokens }
  | { kind: '2fa-required'; twoFactorToken: string };

// Argon2id — recommended by OWASP (stronger than bcrypt)
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

export class AuthService {
  // ─── Register ──────────────────────────────────────────────────────────────

  async register(data: {
    username: string;
    displayName: string;
    password: string;
    phone?: string;
    email?: string;
    publicKey: string;
  }): Promise<{ user: { id: string; username: string | null; displayName: string | null }; tokens: AuthTokens }> {
    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: data.username },
          ...(data.phone ? [{ phone: data.phone }] : []),
          ...(data.email ? [{ email: data.email }] : []),
        ],
      },
      select: { username: true, phone: true, email: true },
    });

    if (existing) {
      if (existing.username === data.username)
        throw new AppError(409, 'USERNAME_TAKEN', 'Username already taken');
      if (existing.phone === data.phone)
        throw new AppError(409, 'PHONE_TAKEN', 'Phone already registered');
      if (existing.email === data.email)
        throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
    }

    const passwordHash = await argon2.hash(data.password, ARGON2_OPTIONS);
    const deviceId = uuidv4();

    const user = await prisma.user.create({
      data: {
        username: data.username,
        displayName: data.displayName,
        passwordHash,
        phone: data.phone,
        email: data.email,
        publicKey: data.publicKey,
      },
      select: { id: true, username: true, displayName: true },
    });

    const tokens = await this._createSession(user.id, deviceId);
    return { user, tokens };
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async login(data: {
    login: string;
    password: string;
    deviceId: string;
    deviceName?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<LoginResult> {
    const user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { username: data.login },
          { phone: data.login },
          { email: data.login },
        ],
      },
      select: { id: true, username: true, displayName: true, avatar: true, passwordHash: true, twoFactorEnabled: true },
    });

    if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid login or password');
    // Юзер мог зарегистрироваться через phone+OTP — у него нет password.
    // Логин по паролю для таких аккаунтов недоступен.
    if (!user.passwordHash) {
      throw new AppError(401, 'NO_PASSWORD_LOGIN', 'This account uses phone login. Use /auth/phone/request.');
    }

    const valid = await argon2.verify(user.passwordHash, data.password);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid login or password');

    // Если 2FA включён — отдаём interstitial токен, ждём шага 2.
    if (user.twoFactorEnabled) {
      return {
        kind: '2fa-required',
        twoFactorToken: signTwoFactorToken(user.id, data.deviceId, data.deviceName),
      };
    }

    return await this._finishLogin(user.id, data.deviceId, data);
  }

  // Завершение логина после успешной 2FA-проверки (или сразу если 2FA выключен).
  private async _finishLogin(
    userId: string,
    deviceId: string,
    meta: { deviceName?: string; ipAddress?: string; userAgent?: string },
  ): Promise<Extract<LoginResult, { kind: 'tokens' }>> {
    const tokens = await this._createSession(userId, deviceId, meta);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { status: 'online', lastSeenAt: new Date() },
      select: { id: true, username: true, displayName: true, avatar: true },
    });

    return { kind: 'tokens', user: updatedUser, tokens };
  }

  // Шаг 2: подтвердить 2FA-код (TOTP или recovery) с interstitial токеном.
  async verifyTwoFactor(data: {
    twoFactorToken: string;
    code: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<Extract<LoginResult, { kind: 'tokens' }>> {
    let payload;
    try { payload = verifyTwoFactorToken(data.twoFactorToken); }
    catch { throw new AppError(401, 'INVALID_2FA_TOKEN', '2FA token expired, login again'); }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, twoFactorEnabled: true, twoFactorSecret: true, twoFactorRecovery: true },
    });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new AppError(400, '2FA_NOT_ENABLED', '2FA is not enabled');
    }

    // Сначала проверим TOTP, потом — recovery
    if (verifyTotp(user.twoFactorSecret, data.code)) {
      return await this._finishLogin(payload.sub, payload.deviceId, {
        deviceName: payload.deviceName,
        ipAddress:  data.ipAddress,
        userAgent:  data.userAgent,
      });
    }

    const recov = consumeRecoveryCode(data.code, user.twoFactorRecovery);
    if (recov.valid) {
      await prisma.user.update({
        where: { id: payload.sub },
        data: { twoFactorRecovery: recov.remaining },
      });
      return await this._finishLogin(payload.sub, payload.deviceId, {
        deviceName: payload.deviceName,
        ipAddress:  data.ipAddress,
        userAgent:  data.userAgent,
      });
    }

    throw new AppError(401, 'INVALID_2FA_CODE', 'Invalid 2FA code');
  }

  // ─── Refresh ───────────────────────────────────────────────────────────────

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired refresh token');
    }

    // Check blacklist
    const isBlacklisted = await redis.exists(`blacklist:${payload.jti}`);
    if (isBlacklisted) throw new AppError(401, 'TOKEN_REVOKED', 'Token has been revoked');

    // Verify session exists
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: { select: { id: true, username: true } } },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new AppError(401, 'SESSION_EXPIRED', 'Session expired, please login again');
    }

    // Rotate. Идемпотентно и устойчиво к гонке: фронт нередко шлёт несколько
    // /refresh с одним токеном (волна 401 на буте, несколько вкладок). Раньше
    // здесь был prisma.session.delete() — проигравший в гонке падал с
    // «Record to delete does not exist» → 500 → ложный логаут (и «сообщение
    // зашифровано»). deleteMany не бросает на 0 строк; старый jti блэклистим,
    // выдаём новую пару. Все конкурентные запросы получают валидные токены.
    const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    await blacklistToken(payload.jti, ttl);
    await prisma.session.deleteMany({ where: { id: session.id } });

    return this._createSession(session.userId, session.deviceId);
  }

  // ─── Logout ────────────────────────────────────────────────────────────────

  async logout(refreshToken: string, userId: string): Promise<void> {
    const session = await prisma.session.findFirst({
      where: { refreshToken, userId },
    });

    if (session) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
        if (ttl > 0) await blacklistToken(payload.jti, ttl);
      } catch {
        // Token already expired — fine
      }
      await prisma.session.delete({ where: { id: session.id } });
    }

    // Mark offline if no more sessions
    const remainingSessions = await prisma.session.count({ where: { userId } });
    if (remainingSessions === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'offline', lastSeenAt: new Date() },
      });
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async _createSession(
    userId: string,
    deviceId: string,
    meta?: { deviceName?: string; ipAddress?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    // Кладём реальный username в access-токен (раньше был ''), чтобы req.username
    // в middleware был консистентным и для legacy/refresh-пути, а не только phone.
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    const accessToken = signAccessToken(userId, u?.username ?? '');
    const { token: refreshToken } = signRefreshToken(userId, deviceId);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.session.upsert({
      where: {
        // We need a unique constraint on userId+deviceId — handled by create/update
        refreshToken: refreshToken, // won't match anything so will always create
      },
      update: {}, // never updates
      create: {
        userId,
        deviceId,
        refreshToken,
        expiresAt,
        deviceName: meta?.deviceName,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 min in seconds
    };
  }
}

export const authService = new AuthService();
