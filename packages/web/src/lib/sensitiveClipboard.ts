/**
 * Копирует чувствительный текст (recovery-коды, 2FA-секрет, текст E2E-сообщений)
 * в системный буфер обмена и через `expireMs` стирает его.
 *
 * Это best-effort защита: пользователь может за это время вставить значение
 * куда захочет, но снижает риск того, что секрет «забудут» в буфере и его
 * прочитает другое приложение или встроенный clipboard manager.
 */
export async function copySensitive(text: string, expireMs = 60_000): Promise<void> {
  await navigator.clipboard.writeText(text);
  setTimeout(() => {
    navigator.clipboard.writeText('').catch(() => {});
  }, expireMs);
}
