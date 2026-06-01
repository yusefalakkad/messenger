import { SmsProvider, SmsDeliveryResult } from './types';

/**
 * Dev-провайдер: не отправляет ничего реально. Печатает код в логи бэкенда
 * и возвращает его клиенту через ответ `/auth/phone/request` (поле devOtp).
 *
 * Использовать ТОЛЬКО при NODE_ENV=development. В продакшене SMS_PROVIDER должен
 * быть 'telegram' или другой реальный канал.
 */
export class DevSmsProvider implements SmsProvider {
  readonly name = 'dev';

  async sendCode(phone: string, code: string): Promise<SmsDeliveryResult> {
    // Печать в логи — выделяется визуально, чтобы было видно в стриме.

    console.log(`\n┌─── 🔐 DEV-OTP ─────────────────────────────`);

    console.log(`│  Phone: ${phone}`);

    console.log(`│  Code:  ${code}`);

    console.log(`└────────────────────────────────────────────\n`);

    return {
      providerRequestId: null,
      echoCodeForDevOnly: code,
    };
  }
}
