import crypto from 'node:crypto';
import { redis } from '../../lib/redis';
import { config } from '../../config';

/**
 * Redis-store одноразовых кодов с защитой от brute-force.
 *
 * Схема ключей:
 *   otp:code:<phone>          → hash {code, attemptsLeft, requestId, createdAt}, TTL = codeTtlSeconds
 *   otp:cooldown:<phone>      → string "1", TTL = requestCooldownSeconds — не даёт спамить request
 *   otp:counter:<phone>       → counter, TTL = requestWindowSeconds — лимит запросов за окно
 *
 *   otp:verify-token:<token>  → phone, TTL = 10 минут — issued после успешного verify,
 *                               позволяет завершить sign-up (POST /complete-profile)
 */

const KEYS = {
  code:        (phone: string) => `otp:code:${phone}`,
  cooldown:    (phone: string) => `otp:cooldown:${phone}`,
  counter:     (phone: string) => `otp:counter:${phone}`,
  verifyToken: (token: string) => `otp:verify-token:${token}`,
} as const;

export class OtpStore {

  /** Получить оставшийся cooldown между запросами (sec). 0 — можно запрашивать. */
  async cooldownRemaining(phone: string): Promise<number> {
    const ttl = await redis.ttl(KEYS.cooldown(phone));
    return ttl > 0 ? ttl : 0;
  }

  /**
   * Атомарно проверяет окно лимита и увеличивает счётчик.
   * Возвращает true если лимит исчерпан (нельзя слать).
   */
  async exceededWindowLimit(phone: string): Promise<boolean> {
    const key = KEYS.counter(phone);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, config.sms.requestWindowSeconds);
    }
    return count > config.sms.maxRequestsPerWindow;
  }

  /**
   * Сохранить выданный код. Кладёт всё в один hash + TTL,
   * заодно ставит cooldown.
   */
  async saveCode(phone: string, code: string, providerRequestId: string | null): Promise<void> {
    const codeKey = KEYS.code(phone);
    await redis.del(codeKey);
    await redis.hset(codeKey, {
      code,
      attemptsLeft: String(config.sms.maxAttempts),
      requestId: providerRequestId ?? '',
      createdAt: String(Date.now()),
    });
    await redis.expire(codeKey, config.sms.codeTtlSeconds);

    await redis.set(
      KEYS.cooldown(phone),
      '1',
      'EX',
      config.sms.requestCooldownSeconds,
    );
  }

  /**
   * Проверить код. Уменьшает attemptsLeft даже при неверном коде.
   * Возвращает:
   *   { ok: true } если код верный (запись удаляется),
   *   { ok: false, attemptsLeft, reason } иначе.
   */
  async verifyCode(phone: string, candidate: string):
    Promise<{ ok: true } | { ok: false; attemptsLeft: number; reason: 'expired' | 'wrong' | 'locked' }> {

    const codeKey = KEYS.code(phone);
    const data = await redis.hgetall(codeKey);

    if (!data || Object.keys(data).length === 0) {
      return { ok: false, attemptsLeft: 0, reason: 'expired' };
    }

    const stored = data.code;
    const attemptsLeft = parseInt(data.attemptsLeft ?? '0', 10);

    if (attemptsLeft <= 0) {
      await redis.del(codeKey);
      return { ok: false, attemptsLeft: 0, reason: 'locked' };
    }

    // Константно-временное сравнение
    if (stored && safeEqualString(stored, candidate)) {
      await redis.del(codeKey);
      return { ok: true };
    }

    const newAttempts = attemptsLeft - 1;
    if (newAttempts <= 0) {
      await redis.del(codeKey);
      return { ok: false, attemptsLeft: 0, reason: 'locked' };
    }

    await redis.hset(codeKey, 'attemptsLeft', String(newAttempts));
    return { ok: false, attemptsLeft: newAttempts, reason: 'wrong' };
  }

  /**
   * Выдать одноразовый verify-token (для шага complete-profile).
   * TTL 10 минут.
   */
  async issueVerifyToken(phone: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    await redis.set(KEYS.verifyToken(token), phone, 'EX', 600);
    return token;
  }

  /**
   * Прочитать verify-token БЕЗ списания. Возвращает phone или null.
   * Используется для предварительных проверок (уникальность username/phone)
   * перед атомарным `consumeVerifyToken` (см. P1-11).
   */
  async peekVerifyToken(token: string): Promise<string | null> {
    return redis.get(KEYS.verifyToken(token));
  }

  /**
   * Проверить и СПИСАТЬ verify-token (одноразовый).
   * Возвращает phone или null.
   */
  async consumeVerifyToken(token: string): Promise<string | null> {
    const key = KEYS.verifyToken(token);
    const phone = await redis.get(key);
    if (!phone) return null;
    await redis.del(key);
    return phone;
  }
}

/** Константно-временное сравнение двух UTF-8 строк (без leak длины внутри Buffer.compare). */
function safeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export const otpStore = new OtpStore();
