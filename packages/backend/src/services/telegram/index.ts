import { config } from '../../config';
import { TelegramBot } from './TelegramBot';
import { TelegramBotHandler } from './TelegramBotHandler';

let _bot: TelegramBot | null = null;
let _handler: TelegramBotHandler | null = null;

/** Singleton TelegramBot (создаётся при первом обращении). */
export function getTelegramBot(): TelegramBot {
  if (_bot) return _bot;
  _bot = new TelegramBot(
    config.sms.telegramBotToken,
    config.sms.telegramBotUsername,
  );
  return _bot;
}

export function getTelegramBotHandler(): TelegramBotHandler {
  if (_handler) return _handler;
  _handler = new TelegramBotHandler(getTelegramBot());
  return _handler;
}

export { TelegramBot, TelegramBotHandler };
export type { TelegramUpdate } from './TelegramBot';
