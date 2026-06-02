/**
 * Web Push backend.
 * VAPID-ключи: берём из env, иначе из Redis, иначе генерируем и кладём в Redis.
 * Subscriptions хранятся в Redis (Set по userId) — стабильно для рестартов, не требует миграции БД.
 */
import webpush from 'web-push';
import { redis } from './redis';
import { logger } from './logger';

const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@akkdmsg.online';

let publicKey:  string | null = null;
let privateKey: string | null = null;
let ready = false;

export async function initPush(): Promise<void> {
  let pub  = process.env.VAPID_PUBLIC_KEY  || null;
  let priv = process.env.VAPID_PRIVATE_KEY || null;

  if (!pub || !priv) {
    pub  = await redis.get('vapid:public');
    priv = await redis.get('vapid:private');
  }

  if (!pub || !priv) {
    // Авто-генерация только в dev — в проде ОБЯЗАТЕЛЬНО задать через env,
    // иначе при FLUSHALL / переезде Redis ключи теряются и все push-подписки
    // у клиентов становятся невалидны (бывший публичный ключ не совпадёт).
    if (process.env.NODE_ENV === 'production') {
      logger.warn(
        'VAPID keys not set in env. Web Push DISABLED in production. ' +
        'Generate via `npx web-push generate-vapid-keys` and add VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY to .env.',
      );
      return; // ready остаётся false, sendPushToUser будет молча no-op
    }
    const keys = webpush.generateVAPIDKeys();
    pub  = keys.publicKey;
    priv = keys.privateKey;
    await redis.set('vapid:public',  pub);
    await redis.set('vapid:private', priv);
    logger.info('Generated new VAPID keys (dev mode, persisted to Redis)');
  }

  webpush.setVapidDetails(VAPID_SUBJECT, pub, priv);
  publicKey  = pub;
  privateKey = priv;
  ready      = true;
}

export function getPublicKey(): string | null { return publicKey; }

const subsKey = (userId: string) => `push:user:${userId}`;

export async function saveSubscription(userId: string, sub: webpush.PushSubscription): Promise<void> {
  if (!sub?.endpoint) return;
  await redis.sadd(subsKey(userId), JSON.stringify(sub));
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  const subs = await redis.smembers(subsKey(userId));
  for (const raw of subs) {
    try {
      const s = JSON.parse(raw) as webpush.PushSubscription;
      if (s.endpoint === endpoint) await redis.srem(subsKey(userId), raw);
    } catch { /* skip malformed */ }
  }
}

export interface PushPayload {
  title:  string;
  body:   string;
  chatId: string;
  // avatar намеренно не передаём — клиент подтянет, если откроет
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ready) return;
  const subs = await redis.smembers(subsKey(userId));
  if (!subs.length) return;

  await Promise.all(subs.map(async (raw) => {
    try {
      const sub = JSON.parse(raw) as webpush.PushSubscription;
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 });
    } catch (err: unknown) {
      const code = (err as { statusCode?: number })?.statusCode;
      // 404/410 — подписка протухла, чистим
      if (code === 404 || code === 410) {
        await redis.srem(subsKey(userId), raw);
      } else {
        logger.warn('push send failed', { code, userId });
      }
    }
  }));
}
