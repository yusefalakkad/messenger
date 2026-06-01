/**
 * 2FA (TOTP) helpers.
 * • Secret: base32, совместим с Google Authenticator / Authy / 1Password
 * • Recovery codes: 10 одноразовых, хранятся как SHA-256 хеши
 * • Interstitial token: короткоживущий JWT (5 мин), подтверждает пройденный шаг 1 (пароль OK, ждём код)
 */
import { authenticator } from 'otplib';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const ISSUER = 'akkdmsg';

// Допуск ±1 окно (30 сек до/после) — для рассинхрона часов
authenticator.options = { window: 1 };

export function generateSecret(): string {
  return authenticator.generateSecret();
}

export function provisioningUri(username: string, secret: string): string {
  return authenticator.keyuri(username, ISSUER, secret);
}

export function verifyTotp(secret: string, code: string): boolean {
  try {
    return authenticator.verify({ token: code.replace(/\s+/g, ''), secret });
  } catch {
    return false;
  }
}

// ─── Recovery codes ──────────────────────────────────────────────────────────

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    return raw.match(/.{4}/g)!.join('-'); // формат: ABCD-1234-5678
  });
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/** Если код валиден — возвращает обновлённый массив без использованного. */
export function consumeRecoveryCode(
  code: string,
  storedHashes: string[],
): { valid: boolean; remaining: string[] } {
  const hash = hashRecoveryCode(code);
  const idx = storedHashes.indexOf(hash);
  if (idx === -1) return { valid: false, remaining: storedHashes };
  return {
    valid: true,
    remaining: [...storedHashes.slice(0, idx), ...storedHashes.slice(idx + 1)],
  };
}

// ─── Interstitial 2FA token ──────────────────────────────────────────────────

interface TwoFactorTokenPayload {
  sub:     string;
  purpose: '2fa';
  deviceId: string;
  deviceName?: string;
}

export function signTwoFactorToken(userId: string, deviceId: string, deviceName?: string): string {
  const payload: TwoFactorTokenPayload = { sub: userId, purpose: '2fa', deviceId, deviceName };
  return jwt.sign(payload, config.jwt.accessSecret, { expiresIn: '5m' });
}

export function verifyTwoFactorToken(token: string): TwoFactorTokenPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret) as TwoFactorTokenPayload;
  if (payload.purpose !== '2fa') throw new Error('Wrong token purpose');
  return payload;
}
