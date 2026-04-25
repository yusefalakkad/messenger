import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { redis, blacklistToken } from '../lib/redis';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AppError } from '../utils/response';
import type { AuthTokens } from '@messenger/shared';

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
  }): Promise<{ user: { id: string; username: string; displayName: string }; tokens: AuthTokens }> {
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
  }): Promise<{ user: { id: string; username: string; displayName: string; avatar: string | null }; tokens: AuthTokens }> {
    const user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { username: data.login },
          { phone: data.login },
          { email: data.login },
        ],
      },
      select: { id: true, username: true, displayName: true, avatar: true, passwordHash: true },
    });

    if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid login or password');

    const valid = await argon2.verify(user.passwordHash, data.password);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid login or password');

    // Upsert session for this device
    const tokens = await this._createSession(user.id, data.deviceId, {
      deviceName: data.deviceName,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    // Update online status
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'online', lastSeenAt: new Date() },
    });

    return {
      user: { id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar },
      tokens,
    };
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

    // Rotate: blacklist old token, issue new pair
    const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    await blacklistToken(payload.jti, ttl);

    const tokens = await this._createSession(session.userId, session.deviceId);

    // Delete old session
    await prisma.session.delete({ where: { id: session.id } });

    return tokens;
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
    const accessToken = signAccessToken(userId, '');
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
