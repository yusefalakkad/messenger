import 'dotenv/config';
import http from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { connectRedis, redis } from './lib/redis';
import { initializeMinio } from './lib/minio';
import { initPush } from './lib/push';
import { initNativePush } from './lib/push-native';
import { getSmsProvider } from './services/sms';
import { initTelegramBot, stopTelegramBot } from './services/telegram/bootstrap';
import { createSocketServer } from './socket/socket.server';
import { initSweepers } from './services/sweepers';
import apiRoutes from './routes/index';
import { errorHandler, notFound } from './middleware/error.middleware';

async function bootstrap(): Promise<void> {
  // ─── Connect services ──────────────────────────────────────────────────────
  await connectDatabase();
  await connectRedis();
  await initializeMinio();
  await initPush();
  await initNativePush();

  // Eagerly init SMS provider. Конфигурационные ошибки (например пустой
  // токен в проде) — фатал. Сетевые ошибки (api.telegram.org недоступен) —
  // warning, сервер всё равно стартует.
  try {
    const sms = getSmsProvider();
    logger.info(`SMS provider: ${sms.name}`);
  } catch (err) {
    logger.error(`SMS provider config error: ${(err as Error).message}`);
    throw err;
  }
  try {
    await initTelegramBot(); // no-op если провайдер не telegram-bot
  } catch (err) {
    logger.warn(`Telegram bot init failed (non-fatal): ${(err as Error).message}`);
  }

  // ─── Express app ───────────────────────────────────────────────────────────
  const app = express();

  // SECURITY: trust proxy ОБЯЗАТЕЛЬНО ставится ДО rateLimit/morgan, иначе
  // express-rate-limit видит nginx-IP вместо клиентского → один общий бакет
  // для всех клиентов = эффективно нет rate-limit.
  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet({
    crossOriginEmbedderPolicy: false, // needed for media
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', config.server.clientUrl],
        mediaSrc: ["'self'", 'blob:'],
      },
    },
  }));

  // CORS
  app.use(cors({
    origin: config.server.clientUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Request logging
  app.use(morgan(config.isDev ? 'dev' : 'combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));

  // Global rate limit
  app.use(rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), env: config.env });
  });

  // API routes
  app.use('/api', apiRoutes);

  // Error handlers (must be last)
  app.use(notFound);
  app.use(errorHandler);

  // ─── HTTP + WebSocket server ───────────────────────────────────────────────
  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);

  // Make io available in routes if needed
  app.set('io', io);

  // Фоновые свиперы: TTL-удаление сообщений + отправка отложенных
  initSweepers(io);

  // ─── Start ─────────────────────────────────────────────────────────────────
  httpServer.listen(config.server.port, () => {
    logger.info(`Server running on http://localhost:${config.server.port}`);
    logger.info(`WebSocket ready`);
    logger.info(`Environment: ${config.env}`);
  });

  // ─── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down...`);
    stopTelegramBot();
    httpServer.close(async () => {
      await disconnectDatabase();
      await redis.quit();
      logger.info('Goodbye');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
