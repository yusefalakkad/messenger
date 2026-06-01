/**
 * Унифицированный интерфейс отправки OTP-кода пользователю.
 *
 * Каждый провайдер инкапсулирует свой канал доставки (Telegram Gateway, SMS,
 * dev-логи). Контроллер вызывает только `sendCode()` — детали скрыты.
 */
export interface SmsProvider {
  /** Имя для логов / телеметрии */
  readonly name: string;

  /**
   * Отправить OTP-код на указанный номер.
   * @param phone — номер в E.164 (например, "+71234567890")
   * @param code  — уже сгенерированный код (provider не генерирует его сам)
   * @returns метаданные доставки (id запроса у провайдера и т.п.) или null
   *
   * Бросает SmsDeliveryError если доставить не удалось.
   */
  sendCode(phone: string, code: string): Promise<SmsDeliveryResult>;
}

export interface SmsDeliveryResult {
  /** Идентификатор запроса у провайдера (для логов / расследований). */
  providerRequestId: string | null;
  /** Возвращать ли код вызывающему (dev-режим — true; prod-режим — false). */
  echoCodeForDevOnly?: string;
  /**
   * Если у TelegramBotProvider нет связки phone↔chatId, мы возвращаем deep-link
   * который клиент должен открыть. Юзер пишет боту, делится номером — после этого
   * бот сам шлёт код. Следующие входы уже идут без deep-link.
   */
  needsTelegramLink?: { deepLink: string };
}

export class SmsDeliveryError extends Error {
  constructor(
    message: string,
    public readonly providerName: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'SmsDeliveryError';
  }
}
