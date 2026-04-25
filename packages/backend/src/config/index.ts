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
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpiresIn: optional('JWT_ACCESS_EXPIRES_IN', '15m'),
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

  upload: {
    maxImageSize: 10 * 1024 * 1024,  // 10 MB
    maxVideoSize: 100 * 1024 * 1024, // 100 MB
    maxVoiceSize: 20 * 1024 * 1024,  // 20 MB
    maxFileSize: 50 * 1024 * 1024,   // 50 MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedVideoTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    allowedVoiceTypes: ['audio/ogg', 'audio/mpeg', 'audio/webm', 'audio/wav'],
  },
} as const;
