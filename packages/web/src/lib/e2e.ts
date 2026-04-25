/**
 * E2E шифрование — высокоуровневый слой поверх Web Crypto API.
 *
 * Алгоритм: ECDH P-256 для обмена ключами + AES-256-GCM для шифрования.
 * Симметрия ECDH: ECDH(alice_priv, bob_pub) === ECDH(bob_priv, alice_pub)
 * — поэтому оба участника независимо выводят одинаковый ключ.
 *
 * Безопасность: выше обычных чатов Telegram (там нет E2E).
 * Приватный ключ НИКОГДА не покидает устройство пользователя.
 */

import type { Chat, Message } from '@messenger/shared';

// ─── Утилиты ──────────────────────────────────────────────────────────────────

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── Кэш выведенных ключей ────────────────────────────────────────────────────
// Ключ кэша: "chatId:первые12симв_pubKey"
// Один и тот же CryptoKey используется и для шифрования, и для расшифровки.

const keyCache = new Map<string, CryptoKey>();

async function getSharedKey(
  chatId: string,
  theirPublicKeyB64: string,
  myPrivateKeyB64: string,
): Promise<CryptoKey> {
  const cacheKey = `${chatId}:${theirPublicKeyB64.slice(0, 12)}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const theirPub = await window.crypto.subtle.importKey(
    'spki',
    fromBase64(theirPublicKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const myPriv = await window.crypto.subtle.importKey(
    'pkcs8',
    fromBase64(myPrivateKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits'],
  );

  const sharedKey = await window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPub },
    myPriv,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  keyCache.set(cacheKey, sharedKey);
  return sharedKey;
}

// ─── Публичный API ────────────────────────────────────────────────────────────

/**
 * Проверяет, включено ли E2E для данного чата.
 * Включено автоматически для личных чатов, если у обоих участников есть ключи.
 */
export function isChatE2E(chat: Chat): boolean {
  if (chat.type !== 'direct') return false;
  return chat.members.every((m) => !!m.user.publicKey);
}

/**
 * Возвращает публичный ключ «другого» пользователя в прямом чате.
 */
export function getRecipientPublicKey(chat: Chat, myUserId: string): string | null {
  const other = chat.members.find((m) => m.userId !== myUserId);
  return other?.user.publicKey ?? null;
}

/**
 * Шифрует текст для отправки.
 * Использует ECDH(myPriv, theirPub) → AES-256-GCM.
 */
export async function encryptText(
  chatId: string,
  plaintext: string,
  recipientPublicKeyB64: string,
  myPrivateKeyB64: string,
): Promise<{ ciphertext: string; nonce: string }> {
  const sharedKey = await getSharedKey(chatId, recipientPublicKeyB64, myPrivateKeyB64);
  const iv        = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded   = new TextEncoder().encode(plaintext);
  const cipherBuf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, encoded);

  return {
    ciphertext: toBase64(new Uint8Array(cipherBuf)),
    nonce:      toBase64(iv),
  };
}

/**
 * Расшифровывает входящее сообщение.
 *
 * Важная деталь: для собственных сообщений (senderId === myUserId)
 * ключ выводится через публичный ключ ПОЛУЧАТЕЛЯ (не свой),
 * а для чужих — через публичный ключ ОТПРАВИТЕЛЯ.
 * Благодаря симметрии ECDH результат одинаков в обоих случаях.
 */
export async function decryptMessage(
  message: Message,
  chat: Chat,
  myUserId: string,
  myPrivateKeyB64: string,
): Promise<string> {
  if (!message.content || !message.nonce) {
    throw new Error('Missing content or nonce');
  }

  // Определяем «другую» сторону для вывода ключа
  const isOwn     = message.senderId === myUserId;
  const otherMember = isOwn
    ? chat.members.find((m) => m.userId !== myUserId)       // я отправил — другая сторона = получатель
    : chat.members.find((m) => m.userId === message.senderId); // мне написали — другая сторона = отправитель

  const theirPublicKey = otherMember?.user.publicKey;
  if (!theirPublicKey) throw new Error('Recipient public key not found');

  const sharedKey = await getSharedKey(chat.id, theirPublicKey, myPrivateKeyB64);
  const iv         = fromBase64(message.nonce);
  const cipherBuf  = fromBase64(message.content);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    cipherBuf,
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Сбрасывает кэш ключей (при logout).
 */
export function clearKeyCache(): void {
  keyCache.clear();
}
