import { describe, it, expect } from 'vitest';
import { formatMessagePreview, formatReplyPreview } from './messagePreview';

describe('formatMessagePreview', () => {
  it('пустое сообщение → пустая строка', () => {
    expect(formatMessagePreview(null)).toBe('');
    expect(formatMessagePreview(undefined)).toBe('');
  });

  it('обычный текст → сам текст', () => {
    expect(formatMessagePreview({ type: 'text', content: 'привет', encrypted: false })).toBe('привет');
  });

  it('зашифрованный текст → маркер 🔒 (не светим ciphertext)', () => {
    expect(formatMessagePreview({ type: 'text', content: 'CIPHERTEXT', encrypted: true }))
      .toBe('🔒 Зашифрованное сообщение');
  });

  it('медиа → emoji-маркеры', () => {
    expect(formatMessagePreview({ type: 'voice', content: null, encrypted: false })).toBe('🎤 Голосовое');
    expect(formatMessagePreview({ type: 'circle', content: null, encrypted: false })).toBe('⭕ Видео-кружок');
    expect(formatMessagePreview({ type: 'file', content: null, encrypted: false })).toBe('📎 Файл');
  });

  it('фото с подписью → 📷 + подпись (если не зашифровано)', () => {
    expect(formatMessagePreview({ type: 'image', content: 'котик', encrypted: false })).toBe('📷 котик');
    expect(formatMessagePreview({ type: 'image', content: 'CIPHER', encrypted: true })).toBe('📷 🔒 Фото');
  });
});

describe('formatReplyPreview', () => {
  it('зашифрованное всегда лочка', () => {
    expect(formatReplyPreview({ type: 'text', content: 'x', encrypted: true })).toBe('🔒 Зашифрованное сообщение');
  });
  it('обычный текст проходит как есть', () => {
    expect(formatReplyPreview({ type: 'text', content: 'ок', encrypted: false })).toBe('ок');
  });
});
