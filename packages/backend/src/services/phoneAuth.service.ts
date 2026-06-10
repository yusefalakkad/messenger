import crypto from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { config } from '../config';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { AppError } from '../utils/response';
import { getSmsProvider, SmsDeliveryError } from './sms';
import { otpStore } from './sms/otpStore';

/** Нормализуем номер в E.164. Бросаем AppError если невалиден.
 *  Принимаем удобные форматы:
 *    8 (XXX) XXX-XX-XX → +7XXXXXXXXXX
 *    8XXXXXXXXXX     → +7XXXXXXXXXX
 *    7XXXXXXXXXX     → +7XXXXXXXXXX (без плюса)
 *    +7XXX, +1XXX    → как есть (libphonenumber разберёт)
 *    XXXXXXXXXX (10) → +7XXXXXXXXXX (домашний код)
 *  Пробелы, скобки, дефисы — стрипятся.
 */
export function normalizePhone(raw: string): string {
  // Оставляем только цифры и плюс
  const cleaned = raw.replace(/[^\d+]/g, '');

  let candidate = cleaned;
  if (!candidate.startsWith('+')) {
    if (candidate.length === 11 && candidate.startsWith('8')) {
      // 8 (XXX) XXX-XX-XX → меняем 8 на +7
      candidate = '+7' + candidate.slice(1);
    } else if (candidate.length === 11 && candidate.startsWith('7')) {
      // 7XXXXXXXXXX без плюса
      candidate = '+' + candidate;
    } else if (candidate.length === 10) {
      // 10 цифр — предполагаем РФ (без кода страны)
      candidate = '+7' + candidate;
    } else {
      // Другая длина / международный без плюса — добавим плюс и пусть libphonenumber решает
      candidate = '+' + candidate;
    }
  }

  const parsed = parsePhoneNumberFromString(candidate);
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
    /** Опциональный новый publicKey — клиент шлёт когда логинится с устройства,
     *  на котором нет приватного ключа. Бэк обновляет user.publicKey, клиент
     *  сохраняет приватный локально. Старые сообщения становятся нерасшифровываемыми
     *  (приватный ключ был привязан к предыдущему устройству — это by design). */
    freshPublicKey?: string,
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
      const data: { phoneVerified: boolean; status: 'online'; lastSeenAt: Date; publicKey?: string } = {
        phoneVerified: true,
        status: 'online',
        lastSeenAt: new Date(),
      };
      // Если клиент прислал свежий публичный ключ — заменяем (явно: новое устройство).
      if (freshPublicKey && freshPublicKey.length >= 32 && freshPublicKey.length <= 256) {
        data.publicKey = freshPublicKey;
      }
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data,
      });

      const tokens = await this._createSession(existing.id, meta);
      return {
        isNewUser: false,
        tokens: { ...tokens, user: shapeUser(updated) },
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
    // P1-11: peek-then-consume. Сначала проверяем что токен валидный И что все
    // уникальности проходят. consumeVerifyToken только перед user.create —
    // одношотовый токен НЕ сжигается, если username taken / phone taken,
    // и юзер может попробовать ещё раз без перезапроса OTP.
    const phone = await otpStore.peekVerifyToken(verifyToken);
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

    // Все проверки прошли — атомарно списываем токен.
    // Race-condition risk: между peek и consume другой запрос с тем же токеном
    // мог проскочить — в этом случае consume вернёт null и мы здесь упадём.
    // Поскольку verify token уникален per юзер per phone, в реальности это значит
    // только double-click того же юзера — приемлемо.
    const consumed = await otpStore.consumeVerifyToken(verifyToken);
    if (!consumed) {
      throw new AppError(401, 'VERIFY_TOKEN_INVALID', 'Verify token expired or already used');
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
