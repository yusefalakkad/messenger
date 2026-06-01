import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { AppError } from '../utils/response';
import { logger } from '../lib/logger';

/** Максимум sync-вызовов на одного юзера в час. */
const SYNC_RATE_LIMIT = 10;
const SYNC_WINDOW_SEC = 60 * 60; // 1h

/**
 * Mask middle digits of a phone for logs: +71234567890 → +71*****7890.
 */
export function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone.replace(/\d/g, '*');
  const head = phone.slice(0, 3);
  const tail = phone.slice(-4);
  return `${head}${'*'.repeat(Math.max(0, phone.length - 7))}${tail}`;
}

/**
 * Нормализуем массив номеров → уникальный список валидных E.164.
 * Невалидные молча отбрасываются (клиент может слать «мусор» из адресной книги).
 */
export function normalizePhones(raw: string[]): string[] {
  const out = new Set<string>();
  for (const r of raw) {
    if (typeof r !== 'string') continue;
    const trimmed = r.trim();
    if (!trimmed) continue;
    const candidate = trimmed.startsWith('+') ? trimmed : '+' + trimmed.replace(/^[^+\d]*/, '');
    const parsed = parsePhoneNumberFromString(candidate);
    if (parsed && parsed.isValid()) out.add(parsed.number);
  }
  return [...out];
}

/**
 * Проверить и инкрементировать счётчик sync-вызовов. Бросает 429 при превышении.
 */
export async function checkSyncRateLimit(userId: string): Promise<void> {
  const key = `ratelimit:contacts-sync:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, SYNC_WINDOW_SEC);
  }
  if (count > SYNC_RATE_LIMIT) {
    const ttl = await redis.ttl(key);
    throw new AppError(429, 'RATE_LIMITED', `Too many sync requests. Retry in ${ttl}s`);
  }
}

export interface MatchedContact {
  id: string;
  phone: string;
  username: string | null;
  displayName: string | null;
  avatar: string | null;
  publicKey: string | null;
}

/**
 * Найти зарегистрированных юзеров по номерам и обновить Contact-записи владельца.
 */
export async function syncContacts(
  ownerId: string,
  phones: string[],
): Promise<MatchedContact[]> {
  if (phones.length === 0) return [];

  const matched = await prisma.user.findMany({
    where: {
      phone: { in: phones },
      deletedAt: null,
      id: { not: ownerId },
    },
    select: {
      id: true,
      phone: true,
      username: true,
      displayName: true,
      avatar: true,
      publicKey: true,
    },
  });

  // Persist Contact rows (upsert — не трогаем существующий nickname/blocked).
  if (matched.length > 0) {
    await prisma.$transaction(
      matched.map((u) =>
        prisma.contact.upsert({
          where: { ownerId_targetId: { ownerId, targetId: u.id } },
          create: { ownerId, targetId: u.id },
          update: {}, // существующую запись не перетираем
        }),
      ),
    );
  }

  logger.info('contacts.sync', {
    ownerId,
    requested: phones.length,
    matched: matched.length,
  });

  return matched as MatchedContact[];
}
