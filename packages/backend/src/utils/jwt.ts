import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

export interface AccessTokenPayload {
  sub: string;    // userId
  username: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;    // userId
  jti: string;    // unique token ID (for blacklisting)
  deviceId: string;
  iat: number;
  exp: number;
}

export function signAccessToken(userId: string, username: string): string {
  return jwt.sign(
    { sub: userId, username },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'] },
  );
}

export function signRefreshToken(userId: string, deviceId: string): { token: string; jti: string } {
  const jti = uuidv4();
  const token = jwt.sign(
    { sub: userId, jti, deviceId },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'] },
  );
  return { token, jti };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as RefreshTokenPayload;
}

export function decodeToken<T>(token: string): T | null {
  try {
    return jwt.decode(token) as T;
  } catch {
    return null;
  }
}
