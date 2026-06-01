/**
 * Тонкая обёртка над Telegram Bot API (api.telegram.org/bot<token>/<method>).
 * Без зависимостей — только нативный fetch.
 *
 * Поддерживает PROXY-режим: если TELEGRAM_API_BASE задан, идём через прокси
 * (например Cloudflare Worker), а не напрямую на api.telegram.org. Нужно
 * когда VPS-хостинг режет outbound в Telegram (типично для RU/CIS).
 *
 * Документация: https://core.telegram.org/bots/api
 */

import { logger } from '../../lib/logger';

// Дефолт — официальный API. Можно переопределить через env:
//   TELEGRAM_API_BASE=https://dakka-tg.your-account.workers.dev
const API_BASE = (process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org').replace(/\/$/, '');
// Если задан — отправляем в заголовке X-Auth-Token. Прокси проверяет и форвардит.
const PROXY_AUTH = process.env.TELEGRAM_API_PROXY_TOKEN ?? '';

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: { id: string; data?: string; from: TelegramUser };
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string; username?: string };
  from?: TelegramUser;
  text?: string;
  contact?: { phone_number: string; user_id?: number; first_name: string; last_name?: string };
  date: number;
}

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  language_code?: string;
}

export interface SendMessageOptions {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: ReplyKeyboardMarkup | ReplyKeyboardRemove | InlineKeyboardMarkup;
  disable_notification?: boolean;
  protect_content?: boolean;
}

export interface ReplyKeyboardMarkup {
  keyboard: Array<Array<{ text: string; request_contact?: boolean }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  is_persistent?: boolean;
}

export interface ReplyKeyboardRemove {
  remove_keyboard: true;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
}

export class TelegramBot {

  constructor(
    private readonly token: string,
    public readonly botUsername: string,
  ) {
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
    if (!botUsername) throw new Error('TELEGRAM_BOT_USERNAME is required');
  }

  /** Базовый вызов любого метода Bot API. */
  private async call<T = unknown>(
    method: string,
    body: Record<string, unknown>,
    timeoutMs = 10_000,
  ): Promise<T> {
    const url = `${API_BASE}/bot${this.token}/${method}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (PROXY_AUTH) headers['X-Auth-Token'] = PROXY_AUTH;
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await resp.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
    if (!resp.ok || !json?.ok) {
      const msg = json?.description ?? `HTTP ${resp.status}`;
      throw new Error(`Telegram API ${method} failed: ${msg}`);
    }
    return json.result as T;
  }

  /** Отправить текстовое сообщение в чат. */
  async sendMessage(chatId: number | string, text: string, options: SendMessageOptions = {}): Promise<TelegramMessage> {
    return this.call<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      ...options,
    });
  }

  /** Установить webhook. Telegram будет POST'ить апдейты на этот URL. */
  async setWebhook(url: string, secretToken: string): Promise<void> {
    await this.call('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    });
    logger.info(`Telegram webhook set to ${url}`);
  }

  /** Снять webhook (для разработки — чтобы можно было использовать polling). */
  async deleteWebhook(): Promise<void> {
    await this.call('deleteWebhook', { drop_pending_updates: true });
  }

  /** Получить текущее состояние webhook'а. */
  async getWebhookInfo(): Promise<{ url: string; has_custom_certificate: boolean; pending_update_count: number; last_error_message?: string }> {
    return this.call('getWebhookInfo', {});
  }

  /**
   * Long-polling для разработки (без webhook'а).
   * Возвращает массив апдейтов; offset нужно передавать на следующем вызове для подтверждения.
   */
  async getUpdates(offset: number, timeoutSec = 25): Promise<TelegramUpdate[]> {
    // Локальный fetch-timeout = серверный long-poll timeout + 5 сек запаса
    return this.call(
      'getUpdates',
      { offset, timeout: timeoutSec, allowed_updates: ['message', 'callback_query'] },
      (timeoutSec + 5) * 1000,
    );
  }

  /** Построить deep-link для авторизации. `t.me/<bot>?start=<startParam>` */
  buildAuthDeepLink(startParam: string): string {
    return `https://t.me/${this.botUsername}?start=${encodeURIComponent(startParam)}`;
  }
}
