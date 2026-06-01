/**
 * Нативные push-уведомления для iOS (APNs) и Android (FCM).
 *
 * Параллельно web-push (lib/push.ts):
 *   - Web: VAPID + Service Worker
 *   - iOS: APNs auth key (.p8) → device token
 *   - Android: Firebase Admin SDK → device token
 *
 * Токены приходят с клиента на POST /push/native-token и сохраняются в Redis:
 *   push:native:<userId>  = Set<JSON({token, platform, at})>
 *
 * ENV:
 *   APNS_BUNDLE_ID      — bundle id iOS-приложения (online.akkdmsg.messen)
 *   APNS_KEY_ID         — Key ID от APNs Auth Key (10 символов)
 *   APNS_TEAM_ID        — Apple Developer Team ID
 *   APNS_KEY            — содержимое .p8 файла (можно одной строкой с \n)
 *   APNS_PRODUCTION     — "true" для prod APNs (false для sandbox/dev)
 *   FCM_SERVICE_ACCOUNT — JSON service account от Firebase (одной строкой)
 */
import { redis } from './redis';
import { logger } from './logger';

// Лениво загружаем тяжёлые SDK — чтобы не падать при отсутствии npm-пакетов.
let apnProvider: any | null = null;
let fcmAdmin:   any | null = null;
let initialized = false;

const subsKey = (userId: string) => `push:native:${userId}`;

interface StoredToken {
  token: string;
  platform: 'ios' | 'android';
  at: number;
}

export async function initNativePush(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // ── APNs ──
  if (process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY && process.env.APNS_BUNDLE_ID) {
    try {
      // @ts-ignore — пакет может быть не установлен в dev
      const apn = await import('apn');
      apnProvider = new apn.Provider({
        token: {
          key: process.env.APNS_KEY.replace(/\\n/g, '\n'),
          keyId: process.env.APNS_KEY_ID,
          teamId: process.env.APNS_TEAM_ID,
        },
        production: process.env.APNS_PRODUCTION === 'true',
      });
      logger.info('[push-native] APNs initialized', {
        bundle: process.env.APNS_BUNDLE_ID,
        production: process.env.APNS_PRODUCTION === 'true',
      });
    } catch (err) {
      logger.warn('[push-native] APNs init failed (install `apn` package)', { err });
    }
  } else {
    logger.info('[push-native] APNs not configured (set APNS_* env vars)');
  }

  // ── FCM ──
  if (process.env.FCM_SERVICE_ACCOUNT) {
    try {
      // @ts-ignore — пакет может быть не установлен в dev
      const admin = await import('firebase-admin');
      if (!admin.apps?.length) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(process.env.FCM_SERVICE_ACCOUNT)),
        });
      }
      fcmAdmin = admin;
      logger.info('[push-native] FCM initialized');
    } catch (err) {
      logger.warn('[push-native] FCM init failed (install `firebase-admin` package)', { err });
    }
  } else {
    logger.info('[push-native] FCM not configured (set FCM_SERVICE_ACCOUNT env var)');
  }
}

export interface NativePushPayload {
  title: string;
  body: string;
  chatId: string;
  badge?: number;
}

/**
 * Отправляет push на ВСЕ сохранённые native-устройства пользователя.
 * Поведение:
 *   - iOS: APNs alert+sound+badge, custom data { chatId } для deep-link
 *   - Android: FCM data-message (бэк-фронт сам отрисует баннер)
 * Невалидные токены автоматически чистим из Redis.
 */
export async function sendNativePushToUser(userId: string, payload: NativePushPayload): Promise<void> {
  const raws = await redis.smembers(subsKey(userId));
  if (!raws.length) return;

  const tokens: StoredToken[] = raws
    .map((r) => { try { return JSON.parse(r) as StoredToken; } catch { return null; } })
    .filter((x): x is StoredToken => !!x);

  const iosTokens     = tokens.filter((t) => t.platform === 'ios').map((t) => t.token);
  const androidTokens = tokens.filter((t) => t.platform === 'android').map((t) => t.token);

  await Promise.all([
    sendToAPNs(userId, iosTokens, payload),
    sendToFCM(userId,  androidTokens, payload),
  ]);
}

// ── APNs ──────────────────────────────────────────────────────────────────────

async function sendToAPNs(userId: string, tokens: string[], payload: NativePushPayload): Promise<void> {
  if (!apnProvider || !tokens.length || !process.env.APNS_BUNDLE_ID) return;
  try {
    // @ts-ignore
    const apn = await import('apn');
    const note = new apn.Notification();
    note.alert = { title: payload.title, body: payload.body };
    note.sound = 'default';
    note.topic = process.env.APNS_BUNDLE_ID!;
    note.payload = { chatId: payload.chatId };
    if (payload.badge !== undefined) note.badge = payload.badge;

    const result = await apnProvider.send(note, tokens);

    // Чистим невалидные токены
    if (result.failed?.length) {
      for (const f of result.failed) {
        const reason = f.response?.reason;
        if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
          await pruneToken(userId, f.device);
        } else {
          logger.warn('[push-native] APNs send failed', { reason, device: f.device });
        }
      }
    }
  } catch (err) {
    logger.warn('[push-native] APNs send threw', { err });
  }
}

// ── FCM ───────────────────────────────────────────────────────────────────────

async function sendToFCM(userId: string, tokens: string[], payload: NativePushPayload): Promise<void> {
  if (!fcmAdmin || !tokens.length) return;
  try {
    const message = {
      notification: {
        title: payload.title,
        body:  payload.body,
      },
      data: {
        chatId: payload.chatId,
      },
      tokens,
    };
    const resp = await fcmAdmin.messaging().sendEachForMulticast(message);

    if (resp.failureCount > 0) {
      resp.responses.forEach((r: any, idx: number) => {
        if (!r.success) {
          const code = r.error?.code;
          if (code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered') {
            void pruneToken(userId, tokens[idx]);
          } else {
            logger.warn('[push-native] FCM send failed', { code, token: tokens[idx]?.slice(0, 10) });
          }
        }
      });
    }
  } catch (err) {
    logger.warn('[push-native] FCM send threw', { err });
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function pruneToken(userId: string, token: string): Promise<void> {
  const raws = await redis.smembers(subsKey(userId));
  for (const raw of raws) {
    try {
      const parsed = JSON.parse(raw) as StoredToken;
      if (parsed.token === token) {
        await redis.srem(subsKey(userId), raw);
      }
    } catch { /* skip */ }
  }
}
