/**
 * Единый helper для preview сообщений (sidebar, archive, search, reply).
 * E2E-сообщения НЕ дешифруем синхронно — показываем маркер 🔒.
 * Для медиа — emoji-маркер + опциональный caption.
 */
import type { Message } from '@messenger/shared';
import i18n from '@/lib/i18n';

type LastLike = Pick<Message, 'type' | 'content' | 'encrypted'>;

export function formatMessagePreview(msg: LastLike | null | undefined): string {
  if (!msg) return '';

  if (msg.type === 'text') {
    return msg.encrypted ? '🔒 Зашифрованное сообщение' : (msg.content ?? '');
  }
  // P1-15: encrypted caption у медиа — content это ciphertext, его нельзя рендерить.
  // Показываем только медиа-маркер + 🔒.
  if (msg.type === 'voice')  return '🎤 Голосовое';
  if (msg.type === 'circle') return '⭕ Видео-кружок';
  if (msg.type === 'image')  return msg.encrypted ? '📷 🔒 Фото' : (msg.content ? `📷 ${msg.content}` : '📷 Фото');
  if (msg.type === 'video')  return msg.encrypted ? '🎬 🔒 Видео' : (msg.content ? `🎬 ${msg.content}` : '🎬 Видео');
  if (msg.type === 'file')   return '📎 Файл';
  // content у poll — вопрос; при encrypted его не светим.
  if (msg.type === 'poll')   return msg.encrypted ? '📊 Опрос' : (msg.content ? `📊 ${msg.content}` : '📊 Опрос');
  if (msg.type === 'system') {
    const call = msg.content?.match(/^__call__:(?:audio|video):(completed|missed):(\d+)$/);
    if (call) {
      if (call[1] === 'missed') return `📞 ${i18n.t('chat.callMissed')}`;
      const dur = parseInt(call[2], 10);
      const d = dur > 0 ? ` ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : '';
      return `📞 ${i18n.t('chat.call')}${d}`;
    }
    return msg.content ?? '';
  }
  return '';
}

/** Короткая reply-preview — для строки внутри пузырька. */
export function formatReplyPreview(msg: LastLike | null | undefined): string {
  if (!msg) return '';
  // Для encrypted всегда лочка — даже когда контента нет (стерильно).
  if (msg.encrypted) return '🔒 Зашифрованное сообщение';
  return formatMessagePreview(msg);
}
