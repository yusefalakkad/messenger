import { config } from '../../config';
import { SmsProvider } from './types';
import { DevSmsProvider } from './DevProvider';
import { TelegramGatewayProvider } from './TelegramGatewayProvider';
import { TelegramBotProvider } from './TelegramBotProvider';
import { getTelegramBot, getTelegramBotHandler } from '../telegram';

/**
 * Фабрика провайдера по env. Singleton — один инстанс на процесс.
 *
 * SMS_PROVIDER=dev           → DevSmsProvider (печать в логи)
 * SMS_PROVIDER=telegram-bot  → TelegramBotProvider (бесплатно, наш @-бот)
 * SMS_PROVIDER=telegram      → TelegramGatewayProvider (Gateway, платный B2B)
 */
let cached: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (cached) return cached;

  const which = config.sms.provider.toLowerCase();
  switch (which) {
    case 'telegram-bot':
    case 'tg-bot':
      cached = new TelegramBotProvider(getTelegramBot(), getTelegramBotHandler());
      break;

    case 'telegram':
    case 'telegram-gateway':
      cached = new TelegramGatewayProvider(config.sms.telegramGatewayToken);
      break;

    case 'dev':
    case '':
    case undefined as unknown as string:
      cached = new DevSmsProvider();
      break;

    default:
      throw new Error(`Unknown SMS_PROVIDER="${which}". Use 'telegram-bot' | 'telegram' | 'dev'.`);
  }

  // Безопасность: в проде запрещаем dev-провайдер
  if (!config.isDev && cached.name === 'dev') {
    throw new Error(
      'SECURITY: DevSmsProvider cannot be used in production. ' +
      'Set SMS_PROVIDER=telegram and TELEGRAM_GATEWAY_TOKEN in environment.',
    );
  }

  return cached;
}

export type { SmsProvider, SmsDeliveryResult } from './types';
export { SmsDeliveryError } from './types';
