/**
 * E2E шифрование — высокоуровневый слой поверх Web Crypto API.
 *
 * Алгоритм: ECDH P-256 → HKDF-SHA256 → AES-256-GCM.
 *
 * Версия v2 (HKDF):
 *   • ECDH P-256 deriveBits → 256-bit shared secret
 *   • HKDF-SHA256 с info = "messenger-e2e-v2:${chatId}" → derived AES-GCM ключ
 *   • Domain separation по chatId: один и тот же shared secret → разные ключи в разных чатах
 *
 * Почему HKDF: raw ECDH output не предназначен для прямого использования как
 * симметричный ключ (нет uniform distribution, нет domain separation). HKDF —
 * правильный KDF из RFC 5869, обязательный шаг для PFS-протоколов (Signal, OPRF).
 *
 * BREAKING: v1 (raw ECDH → AES-GCM) сообщения этой версии расшифровать нельзя.
 * Пользователь явно опт-инул на этот апгрейд (см. docs/WEB_AUDIT_2026-06-10.md, P3-3).
 *
 * Приватный ключ НИКОГДА не покидает устройство пользователя.
 */
const KEY_DERIVATION_INFO = 'messenger-e2e-v2';

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
//
// КЛЮЧ КЭША — sha256(chatId || ":" || ПОЛНЫЙ_pubKey).
//
// Раньше использовался обрезанный префикс pubKey (slice(0, 12)). У всех P-256
// SPKI-ключей первые ~36 base64-символов идентичны (DER-префикс алгоритма),
// поэтому усечённый префикс — фактически одна и та же строка для разных пиров.
// Это могло привести к подмене shared key между чатами (cross-chat confidentiality
// break). Хешируем полный публичный ключ → коллизии исключены.

const keyCache = new Map<string, CryptoKey>();

async function computeCacheKey(chatId: string, fullPubKeyB64: string): Promise<string> {
  const data = new TextEncoder().encode(`${chatId}:${fullPubKeyB64}`);
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  return toBase64(new Uint8Array(hash));
}

async function getSharedKey(
  chatId: string,
  theirPublicKeyB64: string,
  myPrivateKeyB64: string,
): Promise<CryptoKey> {
  // v2-namespaced cache key — чтобы не конфликтовать с возможным in-flight
  // расшифровщиком v1 (если он где-то остался).
  const cacheKey = 'v2:' + await computeCacheKey(chatId, theirPublicKeyB64);
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const theirPub = await window.crypto.subtle.importKey(
    'spki',
    fromBase64(theirPublicKeyB64) as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const myPriv = await window.crypto.subtle.importKey(
    'pkcs8',
    fromBase64(myPrivateKeyB64) as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );

  // Шаг 1: ECDH → 256-bit shared secret.
  const sharedBits = await window.crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPub },
    myPriv,
    256,
  );

  // Шаг 2: импортируем как HKDF-input key.
  const hkdfInput = await window.crypto.subtle.importKey(
    'raw',
    sharedBits as BufferSource,
    'HKDF',
    false,
    ['deriveKey'],
  );

  // Шаг 3: HKDF-SHA256 → AES-GCM 256 key. Info = domain separation per chat.
  const sharedKey = await window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(`${KEY_DERIVATION_INFO}:${chatId}`),
    },
    hkdfInput,
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
    { name: 'AES-GCM', iv: iv as BufferSource },
    sharedKey,
    cipherBuf as BufferSource,
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Сбрасывает кэш ключей (при logout).
 */
export function clearKeyCache(): void {
  keyCache.clear();
}
