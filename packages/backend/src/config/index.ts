import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

/**
 * Жёсткая проверка секретов в production. Падает с ошибкой если:
 *  • секрет короче 32 байт (слабая энтропия)
 *  • секрет содержит "CHANGE_ME", "dev_", "default", "example", "secret"
 *    (т.е. шаблон из .env.example не заменили)
 */
function requireStrongSecret(key: string): string {
  const value = required(key);
  if (process.env.NODE_ENV !== 'production') return value;
  if (value.length < 32) {
    throw new Error(`SECURITY: ${key} must be at least 32 chars in production (got ${value.length})`);
  }
  const lower = value.toLowerCase();
  const weakMarkers = ['change_me', 'changeme', 'dev_', 'default', 'example', 'placeholder', 'todo', 'xxx'];
  for (const m of weakMarkers) {
    if (lower.includes(m)) {
      throw new Error(`SECURITY: ${key} looks like a placeholder ("${m}"). Generate a real random secret.`);
    }
  }
  return value;
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development',

  server: {
    port: parseInt(optional('PORT', '4000'), 10),
    clientUrl: optional('CLIENT_URL', 'http://localhost:5173'),
  },

  db: {
    url: required('DATABASE_URL'),
  },

  redis: {
    url: required('REDIS_URL'),
  },

  jwt: {
    accessSecret:  requireStrongSecret('JWT_ACCESS_SECRET'),
    refreshSecret: requireStrongSecret('JWT_REFRESH_SECRET'),
    accessExpiresIn:  optional('JWT_ACCESS_EXPIRES_IN', '15m'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '30d'),
  },

  minio: {
    endpoint: optional('MINIO_ENDPOINT', 'localhost'),
    port: parseInt(optional('MINIO_PORT', '9000'), 10),
    useSSL: optional('MINIO_USE_SSL', 'false') === 'true',
    accessKey: required('MINIO_ROOT_USER'),
    secretKey: required('MINIO_ROOT_PASSWORD'),
    bucket: optional('MINIO_BUCKET_MEDIA', 'messenger-media'),
  },

  rateLimit: {
    windowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '900000'), 10),
    max: parseInt(optional('RATE_LIMIT_MAX_REQUESTS', '100'), 10),
    authMax: parseInt(optional('AUTH_RATE_LIMIT_MAX', '10'), 10),
  },

  sms: {
    // 'telegram-bot' | 'telegram' (Gateway) | 'dev' | 'twilio' (future)
    provider: optional('SMS_PROVIDER', 'dev'),
    // Telegram Gateway (gateway.telegram.org) — платный B2B канал
    telegramGatewayToken: process.env.TELEGRAM_GATEWAY_TOKEN ?? '',
    // Telegram Bot (наш самописный бот через @BotFather) — БЕСПЛАТНЫЙ канал
    telegramBotToken:    process.env.TELEGRAM_BOT_TOKEN ?? '',
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME ?? '',
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
    telegramWebhookUrl:    process.env.TELEGRAM_WEBHOOK_URL ?? '',
    // OTP-параметры
    codeLength: parseInt(optional('OTP_CODE_LENGTH', '6'), 10),
    codeTtlSeconds: parseInt(optional('OTP_TTL_SECONDS', '300'), 10),   // 5 мин
    maxAttempts: parseInt(optional('OTP_MAX_ATTEMPTS', '5'), 10),
    requestCooldownSeconds: parseInt(optional('OTP_COOLDOWN_SECONDS', '60'), 10),
    maxRequestsPerWindow: parseInt(optional('OTP_MAX_PER_WINDOW', '3'), 10),
    requestWindowSeconds: parseInt(optional('OTP_WINDOW_SECONDS', '900'), 10), // 15 мин
  },

  livekit: {
    // SFU для групповых звонков (до 8 участников). 1-на-1 звонки идут НЕ через
    // LiveKit, а через прямой peer-to-peer WebRTC (см. CallOverlay + coturn).
    // Если apiKey/apiSecret/url пусты — групповой звонок отключён, endpoint
    // /api/livekit/token вернёт 503 LIVEKIT_DISABLED.
    apiKey:    optional('LIVEKIT_API_KEY', ''),
    apiSecret: optional('LIVEKIT_API_SECRET', ''),
    url:       optional('LIVEKIT_URL', ''),
  },

  upload: {
    maxImageSize: 10 * 1024 * 1024,  // 10 MB
    maxVideoSize: 100 * 1024 * 1024, // 100 MB
    maxVoiceSize: 20 * 1024 * 1024,  // 20 MB
    maxFileSize: 50 * 1024 * 1024,   // 50 MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedVideoTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    allowedVoiceTypes: ['audio/ogg', 'audio/mpeg', 'audio/webm', 'audio/wav', 'audio/mp4'],
  },

  // HMAC-подписанные media URL: `<PUBLIC_BASE_URL>/api/media/...?t=<hmac>`
  // publicBaseUrl: абсолютный origin (https://akkdmsg.online) для native-сборки,
  // или пустая строка для web (тогда URL остаётся относительным).
  // signedUrlTtlSeconds: 24 часа достаточно — клиент при перерендере истории получит свежие URL.
  media: {
    publicBaseUrl: optional('PUBLIC_BASE_URL', ''),
    signedUrlTtlSeconds: parseInt(optional('MEDIA_URL_TTL_SECONDS', '86400'), 10),
  },
} as const;
