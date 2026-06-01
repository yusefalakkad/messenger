/**
 * Обработчик апдейтов от Telegram-бота.
 *
 * Поддерживает 2 сценария:
 *  A) /start <link_token>  — юзер пришёл по deep-link с сайта.
 *      Сохраняем link_token → ждём contact-share.
 *  B) Юзер прислал контакт (сообщение с поделённым номером).
 *      Сохраняем (phone, chat_id) в TelegramAuthLink и шлём OTP-код,
 *      который был ассоциирован с link_token.
 *
 * Кратко: link_token связывает «сеанс на сайте» с «беседой в боте».
 */

import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { TelegramBot, TelegramUpdate } from './TelegramBot';

const PENDING_TTL_SEC = 600; // 10 мин на завершение handshake

/** Ключи Redis для pending-handshake state. */
const KEYS = {
  /** link_token → phone (номер с которым юзер начал auth на сайте). */
  pendingPhone: (token: string) => `tg:link:${token}:phone`,
  /** link_token → 6-значный OTP-код, который покажем юзеру в боте после contact-share. */
  pendingCode:  (token: string) => `tg:link:${token}:code`,
  /** chat_id → link_token (чтобы при contact-share знать какой код отправлять). */
  chatToken:    (chatId: number) => `tg:chat:${chatId}:link`,
} as const;

export class TelegramBotHandler {

  constructor(private readonly bot: TelegramBot) {}

  /**
   * Зарезервировать handshake. Возвращает deep-link для юзера.
   * Сохраняем (link_token → phone, code) в Redis с TTL 10 мин.
   */
  async beginHandshake(phone: string, code: string, linkToken: string): Promise<string> {
    await redis.set(KEYS.pendingPhone(linkToken), phone, 'EX', PENDING_TTL_SEC);
    await redis.set(KEYS.pendingCode(linkToken), code, 'EX', PENDING_TTL_SEC);
    return this.bot.buildAuthDeepLink(`auth_${linkToken}`);
  }

  /** Обработать один апдейт от Telegram. Вызывается из webhook-эндпоинта. */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    try {
      const msg = update.message;
      if (!msg) return;
      const chatId = msg.chat.id;

      // /start <param> — фиксируем привязку link_token к chatId, просим контакт
      if (msg.text?.startsWith('/start')) {
        const param = msg.text.slice(7).trim();
        await this.onStart(chatId, msg.chat.username, param);
        return;
      }

      // /help — справка
      if (msg.text === '/help') {
        await this.bot.sendMessage(chatId,
          'Я бот @' + this.bot.botUsername + '. Отправляю одноразовые коды для входа в Dakka.\n\n' +
          'Поделитесь своим номером телефона (кнопка ниже), и я смогу присылать вам коды.',
          { reply_markup: this.requestContactKeyboard() },
        );
        return;
      }

      // Юзер поделился контактом
      if (msg.contact) {
        await this.onContact(chatId, msg.chat.username, msg.contact.phone_number, msg.from?.id);
        return;
      }

      // Любой другой текст — мягкая подсказка
      if (msg.text) {
        await this.bot.sendMessage(chatId,
          'Чтобы получать коды для входа в Dakka, поделитесь номером телефона (кнопка ниже).',
          { reply_markup: this.requestContactKeyboard() },
        );
      }
    } catch (err) {
      logger.error('TelegramBotHandler error', { err: (err as Error).message });
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async onStart(chatId: number, username: string | undefined, param: string): Promise<void> {
    // param формата "auth_<token>"
    let linkToken: string | null = null;
    if (param.startsWith('auth_')) {
      const token = param.slice(5);
      // Проверяем что такой pending-handshake существует
      const exists = await redis.exists(KEYS.pendingPhone(token));
      if (exists === 1) {
        linkToken = token;
        await redis.set(KEYS.chatToken(chatId), token, 'EX', PENDING_TTL_SEC);
      }
    }

    if (linkToken) {
      await this.bot.sendMessage(chatId,
        '👋 Привет! Чтобы получить код для входа в Dakka, нажмите кнопку «Поделиться номером» ниже.\n\n' +
        '🔒 Номер используется только для отправки одноразовых кодов входа. Мы не пишем рекламу и не передаём номер третьим лицам.',
        { reply_markup: this.requestContactKeyboard() },
      );
    } else {
      // /start без параметра или с истёкшим/неверным токеном
      await this.bot.sendMessage(chatId,
        '👋 Это бот мессенджера Dakka.\n\n' +
        'Я отправляю одноразовые коды для входа. Чтобы я мог писать вам, поделитесь номером телефона кнопкой ниже — это разовое действие.',
        { reply_markup: this.requestContactKeyboard() },
      );
    }
  }

  private async onContact(
    chatId: number,
    username: string | undefined,
    rawPhone: string,
    contactUserId: number | undefined,
  ): Promise<void> {
    // Защита: юзер не может поделиться чужим номером (TG проверяет это сам, но проверим тоже)
    if (contactUserId && contactUserId !== chatId) {
      await this.bot.sendMessage(chatId,
        '⚠️ Можно поделиться только своим собственным номером телефона.',
      );
      return;
    }

    // Нормализуем номер в E.164
    const parsed = parsePhoneNumberFromString(rawPhone.startsWith('+') ? rawPhone : '+' + rawPhone);
    if (!parsed || !parsed.isValid()) {
      await this.bot.sendMessage(chatId, '⚠️ Не удалось распознать номер. Попробуйте ещё раз.');
      return;
    }
    const phone = parsed.number;

    // Сохраняем/обновляем связку phone↔chatId
    await prisma.telegramAuthLink.upsert({
      where: { phone },
      create: {
        phone,
        chatId: BigInt(chatId),
        username: username ?? null,
      },
      update: {
        chatId: BigInt(chatId),
        username: username ?? null,
        lastUsedAt: new Date(),
      },
    });

    // Есть ли pending-код для этого link_token? Если есть — шлём.
    const linkToken = await redis.get(KEYS.chatToken(chatId));
    if (linkToken) {
      const pendingPhone = await redis.get(KEYS.pendingPhone(linkToken));
      const pendingCode = await redis.get(KEYS.pendingCode(linkToken));

      // Защита: link_token должен соответствовать только что подтверждённому номеру
      if (pendingPhone && pendingCode && pendingPhone === phone) {
        await this.sendCodeMessage(chatId, pendingCode);
        // Подчищаем pending-state, оставляем только постоянный link
        await redis.del(KEYS.pendingPhone(linkToken));
        await redis.del(KEYS.pendingCode(linkToken));
        await redis.del(KEYS.chatToken(chatId));
        return;
      }

      if (pendingPhone && pendingPhone !== phone) {
        await this.bot.sendMessage(chatId,
          '⚠️ Вы пытались войти под номером, отличным от того, который сейчас поделили. ' +
          'Откройте сайт ещё раз и введите номер, привязанный к этому Telegram-аккаунту.',
        );
        return;
      }
    }

    // Pending-handshake нет (юзер просто привязал номер «впрок»)
    await this.bot.sendMessage(chatId,
      '✅ Номер привязан. Теперь когда вы войдёте на сайте Dakka с номером ' +
      formatPhoneMasked(phone) + ', код придёт прямо сюда.',
      { reply_markup: { remove_keyboard: true } },
    );
  }

  /** Прямая отправка OTP в существующий бот-чат (используется для повторных входов). */
  async sendCodeMessage(chatId: number | bigint, code: string): Promise<void> {
    await this.bot.sendMessage(Number(chatId),
      '🔐 Ваш код для входа в Dakka:\n\n' +
      `<b><code>${code}</code></b>\n\n` +
      'Код действителен 5 минут. Никому не передавайте его.',
      { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } },
    );
  }

  private requestContactKeyboard() {
    return {
      keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
      is_persistent: false,
    };
  }
}

function formatPhoneMasked(phone: string): string {
  // +71234567890 → +7 *** ***-67-90
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 2)} *** ***-${phone.slice(-4, -2)}-${phone.slice(-2)}`;
}
