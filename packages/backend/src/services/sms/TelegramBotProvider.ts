import crypto from 'node:crypto';
import { SmsProvider, SmsDeliveryResult, SmsDeliveryError } from './types';
import { prisma } from '../../lib/prisma';
import { TelegramBot } from '../telegram/TelegramBot';
import { TelegramBotHandler } from '../telegram/TelegramBotHandler';

/**
 * Доставка OTP через собственный Telegram-бот (бесплатно, без Gateway).
 *
 * Алгоритм:
 *   1. Ищем TelegramAuthLink для phone:
 *      ├─ есть → шлём sendMessage прямо в этот chatId
 *      └─ нет  → создаём pending-handshake (link_token), возвращаем deep-link
 *                клиенту. Дальше его обрабатывает TelegramBotHandler при /start
 *                + contact-share.
 */
export class TelegramBotProvider implements SmsProvider {
  readonly name = 'telegram-bot';

  constructor(
    private readonly bot: TelegramBot,
    private readonly handler: TelegramBotHandler,
  ) {}

  async sendCode(phone: string, code: string): Promise<SmsDeliveryResult> {
    // Шаг 1: есть ли уже привязка phone → chatId?
    const link = await prisma.telegramAuthLink.findUnique({
      where: { phone },
      select: { chatId: true, id: true },
    });

    if (link) {
      try {
        await this.handler.sendCodeMessage(link.chatId, code);
        await prisma.telegramAuthLink.update({
          where: { id: link.id },
          data: { lastUsedAt: new Date() },
        });
        return { providerRequestId: null };
      } catch (err) {
        // Возможные причины: юзер заблокировал бота / удалил чат.
        // Тогда стираем связку и просим заново привязать.
        const msg = (err as Error).message;
        if (msg.includes('blocked') || msg.includes('Forbidden') || msg.includes('chat not found')) {
          await prisma.telegramAuthLink.delete({ where: { id: link.id } });
          // Падает в код ниже — создаём новый handshake
        } else {
          throw new SmsDeliveryError(
            `Telegram bot send failed: ${msg}`,
            this.name,
            true,
          );
        }
      }
    }

    // Шаг 2: связки нет (или была потеряна) — создаём deep-link handshake
    const linkToken = crypto.randomBytes(16).toString('hex');
    const deepLink = await this.handler.beginHandshake(phone, code, linkToken);

    return {
      providerRequestId: linkToken,
      needsTelegramLink: { deepLink },
    };
  }
}
