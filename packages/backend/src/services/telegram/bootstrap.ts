/**
 * При старте бэка, если выбран SMS_PROVIDER=telegram-bot:
 *  • Prod (TELEGRAM_WEBHOOK_URL задан): ставим webhook → TG шлёт нам POST
 *  • Dev  (URL не задан): запускаем long-polling getUpdates
 */

import { config } from '../../config';
import { logger } from '../../lib/logger';
import { getTelegramBot, getTelegramBotHandler } from './index';

let pollingStop: (() => void) | null = null;

export async function initTelegramBot(): Promise<void> {
  const provider = config.sms.provider.toLowerCase();
  if (provider !== 'telegram-bot' && provider !== 'tg-bot') return;

  if (!config.sms.telegramBotToken || !config.sms.telegramBotUsername) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN и TELEGRAM_BOT_USERNAME обязательны при SMS_PROVIDER=telegram-bot. ' +
      'Получить токен: @BotFather → /newbot.',
    );
  }

  const bot = getTelegramBot();
  const handler = getTelegramBotHandler();

  if (config.sms.telegramWebhookUrl) {
    // Production: ставим webhook
    if (!config.sms.telegramWebhookSecret) {
      throw new Error('TELEGRAM_WEBHOOK_SECRET обязателен при заданном TELEGRAM_WEBHOOK_URL');
    }
    await bot.setWebhook(config.sms.telegramWebhookUrl, config.sms.telegramWebhookSecret);
  } else {
    // Dev: снимаем webhook (если был) и запускаем long-polling
    await bot.deleteWebhook();
    logger.info('Telegram bot: starting long-polling (dev mode)');

    let offset = 0;
    let alive = true;
    pollingStop = () => { alive = false; };

    (async () => {
      while (alive) {
        try {
          const updates = await bot.getUpdates(offset, 25);
          for (const u of updates) {
            await handler.handleUpdate(u);
            offset = u.update_id + 1;
          }
        } catch (err) {
          logger.warn('Telegram polling error', { err: (err as Error).message });
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    })();
  }
}

export function stopTelegramBot(): void {
  pollingStop?.();
  pollingStop = null;
}
