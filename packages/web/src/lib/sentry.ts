/**
 * Sentry — мониторинг ошибок фронтенда.
 *
 * Без VITE_SENTRY_DSN — полный no-op (ничего не шлётся). Чтобы включить:
 * задать VITE_SENTRY_DSN в .env (со страницы проекта в sentry.io).
 */
import * as Sentry from '@sentry/react';

export function initSentry(): void {
  const dsn = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SENTRY_DSN;
  if (!dsn) return; // no-op без DSN
  Sentry.init({
    dsn,
    environment: (import.meta as { env?: Record<string, string | undefined> }).env?.MODE,
    tracesSampleRate: 0.1,
    // Не отправляем PII по умолчанию (приватность переписки).
    sendDefaultPii: false,
  });
}
