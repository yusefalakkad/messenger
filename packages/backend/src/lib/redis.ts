import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  lazyConnect: true,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', { err: err.message }));
redis.on('close', () => logger.warn('Redis connection closed'));

export async function connectRedis(): Promise<void> {
  await redis.connect();
}

// ─── Typed Redis Helpers ───────────────────────────────────────────────────────

const KEYS = {
  userSocketMap: (userId: string) => `socket:user:${userId}`,    // userId → socketId[]
  onlineUsers: () => 'users:online',                               // Set of online userIds
  typingStatus: (chatId: string) => `typing:${chatId}`,           // Set of typing userIds
  refreshTokenBlacklist: (jti: string) => `blacklist:${jti}`,     // Revoked tokens
  rateLimitAuth: (ip: string) => `ratelimit:auth:${ip}`,
} as const;

export const cacheKeys = KEYS;

export async function setUserOnline(userId: string, socketId: string): Promise<void> {
  await Promise.all([
    redis.sadd(KEYS.onlineUsers(), userId),
    redis.sadd(KEYS.userSocketMap(userId), socketId),
  ]);
}

export async function setUserOffline(userId: string, socketId: string): Promise<void> {
  await redis.srem(KEYS.userSocketMap(userId), socketId);
  const remaining = await redis.scard(KEYS.userSocketMap(userId));
  if (remaining === 0) {
    await redis.srem(KEYS.onlineUsers(), userId);
  }
}

export async function isUserOnline(userId: string): Promise<boolean> {
  return (await redis.sismember(KEYS.onlineUsers(), userId)) === 1;
}

export async function getOnlineUsers(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const pipeline = redis.pipeline();
  userIds.forEach((id) => pipeline.sismember(KEYS.onlineUsers(), id));
  const results = await pipeline.exec();
  const online = new Set<string>();
  results?.forEach(([, val], i) => {
    if (val === 1) online.add(userIds[i]);
  });
  return online;
}

export async function blacklistToken(jti: string, expiresInSec: number): Promise<void> {
  await redis.setex(KEYS.refreshTokenBlacklist(jti), expiresInSec, '1');
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  return (await redis.exists(KEYS.refreshTokenBlacklist(jti))) === 1;
}
