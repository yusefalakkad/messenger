import { Router, Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../lib/logger';
import { getTelegramBotHandler, TelegramUpdate } from '../services/telegram';

/**
 * POST /api/telegram/webhook — приёмник апдейтов от Telegram.
 *
 * Безопасность:
 *  - TG шлёт заголовок X-Telegram-Bot-Api-Secret-Token = WEBHOOK_SECRET,
 *    мы его проверяем константно-временно.
 *  - Сам URL должен быть HTTPS и сложно угадываем (например, содержит секрет в path).
 *  - Никто кроме TG не должен знать ни URL, ни secret_token.
 */
const router = Router();

router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  // Проверка secret_token из заголовка
  const expected = config.sms.telegramWebhookSecret;
  if (!expected) {
    res.status(500).json({ ok: false, error: 'webhook secret not configured' });
    return;
  }
  const got = req.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
  if (!timingSafeStringEqual(got, expected)) {
    logger.warn('Telegram webhook: invalid secret token');
    res.status(403).json({ ok: false });
    return;
  }

  const update = req.body as TelegramUpdate;
  // Отвечаем сразу 200 чтобы TG не ретраил, а апдейт обрабатываем асинхронно
  res.status(200).json({ ok: true });

  try {
    await getTelegramBotHandler().handleUpdate(update);
  } catch (err) {
    logger.error('Telegram webhook handler crashed', { err: (err as Error).message });
  }
});

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export default router;
