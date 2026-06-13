/**
 * Sentry — мониторинг ошибок. Импортируется ПЕРВЫМ в index.ts (до express и
 * остального), иначе авто-инструментирование не сработает.
 *
 * Без SENTRY_DSN — полный no-op (ничего не шлётся), приложение работает как есть.
 * Чтобы включить: задать env SENTRY_DSN (со страницы проекта в sentry.io).
 */
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN, // undefined → Sentry отключён (no-op)
  environment: process.env.NODE_ENV ?? 'development',
  // Доля трейсов производительности (10%). Снизить/поднять при необходимости.
  tracesSampleRate: 0.1,
  // Не шлём PII (тела запросов/заголовки) по умолчанию — приватность.
  sendDefaultPii: false,
});
