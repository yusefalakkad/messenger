import { SmsProvider, SmsDeliveryResult, SmsDeliveryError } from './types';

/**
 * Доставка OTP через Telegram Gateway (https://core.telegram.org/gateway).
 *
 * Это официальный платёжный API Telegram, который доставляет код прямо в чат
 * пользователя через приложение Telegram — бесплатно для отправителя при
 * наличии у получателя TG-аккаунта.
 *
 * Поток:
 *  1) checkSendAbility(phone) — проверяем что номер достижим (опционально, бесплатно)
 *  2) sendVerificationMessage(phone, code) — отправляем код
 *
 * Требует переменную окружения TELEGRAM_GATEWAY_TOKEN — токен из gateway.telegram.org.
 */
export class TelegramGatewayProvider implements SmsProvider {
  readonly name = 'telegram';

  constructor(private readonly token: string) {
    if (!token) {
      throw new Error('TELEGRAM_GATEWAY_TOKEN is required for telegram provider');
    }
  }

  async sendCode(phone: string, code: string): Promise<SmsDeliveryResult> {
    const url = 'https://gatewayapi.telegram.org/sendVerificationMessage';
    const body = {
      phone_number: phone,
      code,
      // ttl в секундах — после истечения TG пометит сообщение как недействительное
      ttl: 300,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        // 10-секундный таймаут чтобы не висеть бесконечно
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new SmsDeliveryError(
        `Network error talking to Telegram Gateway: ${(err as Error).message}`,
        this.name,
        true,
      );
    }

    const json = await response.json().catch(() => null) as { ok?: boolean; result?: { request_id?: string }; error?: string } | null;

    if (!response.ok || !json?.ok) {
      const msg = json?.error ?? `HTTP ${response.status}`;
      throw new SmsDeliveryError(
        `Telegram Gateway returned error: ${msg}`,
        this.name,
        response.status >= 500,
      );
    }

    return {
      providerRequestId: json.result?.request_id ?? null,
    };
  }
}
