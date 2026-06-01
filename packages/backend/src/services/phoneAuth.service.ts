import crypto from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { config } from '../config';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { AppError } from '../utils/response';
import { getSmsProvider, SmsDeliveryError } from './sms';
import { otpStore } from './sms/otpStore';

/** Нормализуем номер в E.164. Бросаем AppError если невалиден. */
export function normalizePhone(raw: string): string {
  const parsed = parsePhoneNumberFromString(raw);
  if (!parsed || !parsed.isValid()) {
    throw new AppError(400, 'INVALID_PHONE', 'Phone number is invalid');
  }
  return parsed.number; // already E.164 with +
}

/** Сгенерировать N-значный численный код. */
function generateOtp(length: number): string {
  // crypto.randomInt(0, 10^length) — равномерно
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return n.toString().padStart(length, '0');
}

export interface RequestCodeResult {
  /** Через сколько секунд можно повторно запросить код. */
  cooldownSec: number;
  /** Только для dev: код возвращается в ответе для тестов. */
  devOtp?: string;
  /**
   * Telegram-bot провайдер: если у юзера ещё нет связки с ботом,
   * показываем deep-link "Открыть бота".
   */
  telegramDeepLink?: string;
}

export interface VerifyCodeResult {
  /** Был ли это первый верифицированный вход (нужен complete-profile). */
  isNewUser: boolean;
  /** При isNewUser=true — токен для completeProfile. */
  verifyToken?: string;
  /** При isNewUser=false — готовая сессия. */
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: ReturnType<typeof shapeUser>;
  };
}

function shapeUser(u: { id: string; phone: string | null; username: string | null; displayName: string | null; avatar: string | null; bio: string | null; publicKey: string | null }) {
  return {
    id: u.id,
    phone: u.phone,
    username: u.username,
    displayName: u.displayName,
    avatar: u.avatar,
    bio: u.bio,
    publicKey: u.publicKey,
  };
}

export class PhoneAuthService {

  /** Шаг 1: запросить код на номер. */
  async requestCode(rawPhone: string): Promise<RequestCodeResult> {
    const phone = normalizePhone(rawPhone);

    // Cooldown между двумя запросами
    const cooldown = await otpStore.cooldownRemaining(phone);
    if (cooldown > 0) {
      throw new AppError(429, 'OTP_COOLDOWN', `Wait ${cooldown}s before requesting another code`);
    }

    // Окно лимита (3 запроса / 15 мин)
    const exceeded = await otpStore.exceededWindowLimit(phone);
    if (exceeded) {
      throw new AppError(429, 'OTP_RATE_LIMIT', 'Too many code requests, try later');
    }

    const code = generateOtp(config.sms.codeLength);

    let providerRequestId: string | null = null;
    let echoCodeForDevOnly: string | undefined;
    let telegramDeepLink: string | undefined;
    try {
      const provider = getSmsProvider();
      const r = await provider.sendCode(phone, code);
      providerRequestId = r.providerRequestId;
      echoCodeForDevOnly = r.echoCodeForDevOnly;
      telegramDeepLink = r.needsTelegramLink?.deepLink;
    } catch (err) {
      if (err instanceof SmsDeliveryError) {
        logger.error('SMS delivery failed', { phone: maskPhone(phone), provider: err.providerName, err: err.message });
        throw new AppError(502, 'SMS_DELIVERY_FAILED', 'Could not deliver code, try again');
      }
      throw err;
    }

    await otpStore.saveCode(phone, code, providerRequestId);

    // В dev-режиме возвращаем сам код для удобства разработки
    return {
      cooldownSec: config.sms.requestCooldownSeconds,
      devOtp: config.isDev ? echoCodeForDevOnly : undefined,
      telegramDeepLink,
    };
  }

  /** Шаг 2: проверить код. Возвращает либо tokens, либо verifyToken для complete-profile. */
  async verifyCode(
    rawPhone: string,
    code: string,
    meta: { deviceId: string; deviceName?: string; ipAddress?: string; userAgent?: string },
  ): Promise<VerifyCodeResult> {
    const phone = normalizePhone(rawPhone);
    const result = await otpStore.verifyCode(phone, code);

    if (!result.ok) {
      if (result.reason === 'expired') {
        throw new AppError(400, 'OTP_EXPIRED', 'Code expired, request a new one');
      }
      if (result.reason === 'locked') {
        throw new AppError(429, 'OTP_LOCKED', 'Too many wrong attempts, request a new code');
      }
      throw new AppError(401, 'OTP_WRONG', `Wrong code, ${result.attemptsLeft} attempts left`);
    }

    // Код верный — ищем существующего юзера
    const existing = await prisma.user.findUnique({ where: { phone } });

    if (existing) {
      // Привет, старый знакомый — обновляем phoneVerified и выдаём сессию
      await prisma.user.update({
        where: { id: existing.id },
        data: { phoneVerified: true, status: 'online', lastSeenAt: new Date() },
      });

      const tokens = await this._createSession(existing.id, meta);
      return {
        isNewUser: false,
        tokens: { ...tokens, user: shapeUser(existing) },
      };
    }

    // Новый юзер — выдаём verify-token для шага complete-profile
    const verifyToken = await otpStore.issueVerifyToken(phone);
    return {
      isNewUser: true,
      verifyToken,
    };
  }

  /** Шаг 3 (только для новых): заполнить displayName, username, publicKey. */
  async completeProfile(
    verifyToken: string,
    profile: { displayName: string; username?: string; publicKey: string },
    meta: { deviceId: string; deviceName?: string; ipAddress?: string; userAgent?: string },
  ) {
    const phone = await otpStore.consumeVerifyToken(verifyToken);
    if (!phone) {
      throw new AppError(401, 'VERIFY_TOKEN_INVALID', 'Verify token expired or already used');
    }

    // Защита от гонки: вдруг кто-то параллельно зарегистрировался
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new AppError(409, 'PHONE_ALREADY_REGISTERED', 'Phone already registered');
    }

    // Если username не задан — пропускаем (можно установить позже)
    if (profile.username) {
      const taken = await prisma.user.findUnique({ where: { username: profile.username } });
      if (taken) {
        throw new AppError(409, 'USERNAME_TAKEN', 'Username already taken');
      }
    }

    const user = await prisma.user.create({
      data: {
        phone,
        phoneVerified: true,
        displayName: profile.displayName,
        username: profile.username || null,
        publicKey: profile.publicKey,
        status: 'online',
        lastSeenAt: new Date(),
      },
    });

    const tokens = await this._createSession(user.id, meta);
    return { ...tokens, user: shapeUser(user) };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async _createSession(
    userId: string,
    meta: { deviceId: string; deviceName?: string; ipAddress?: string; userAgent?: string },
  ) {
    // Один активный refresh-token на (user, device) — старые подчищаем
    await prisma.session.deleteMany({
      where: { userId, deviceId: meta.deviceId },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    const accessToken = signAccessToken(userId, user?.username ?? '');
    const { token: refreshToken } = signRefreshToken(userId, meta.deviceId);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.session.create({
      data: {
        userId,
        deviceId: meta.deviceId,
        refreshToken,
        expiresAt,
        deviceName: meta.deviceName,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
    };
  }
}

function maskPhone(p: string): string {
  if (p.length < 6) return '***';
  return p.slice(0, 4) + '***' + p.slice(-2);
}

export const phoneAuthService = new PhoneAuthService();
