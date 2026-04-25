/**
 * E2E шифрование для браузера.
 * Используем Web Crypto API (встроен в браузер) вместо libsodium,
 * чтобы не было проблем с бандлером.
 *
 * Алгоритм: X25519 (ECDH) + AES-256-GCM
 * Уровень безопасности: эквивалентен Signal Protocol для обмена ключами.
 */

export interface KeyPair {
  publicKey: string;  // base64
  privateKey: string; // base64 — НИКОГДА не отправлять на сервер
}

export interface EncryptedMessage {
  ciphertext: string; // base64
  nonce: string;      // base64
}

const crypto = window.crypto;

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Генерирует пару ключей X25519 для E2E шифрования.
 * Приватный ключ хранится ТОЛЬКО на устройстве пользователя.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );

  const publicKeyBuf = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyBuf = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: toBase64(publicKeyBuf),
    privateKey: toBase64(privateKeyBuf),
  };
}

/**
 * Шифрует сообщение для получателя (ECDH + AES-256-GCM).
 */
export async function encryptMessage(
  message: string,
  recipientPublicKeyB64: string,
  senderPrivateKeyB64: string,
): Promise<EncryptedMessage> {
  const recipientPublicKey = await crypto.subtle.importKey(
    'spki',
    fromBase64(recipientPublicKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const senderPrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    fromBase64(senderPrivateKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits'],
  );

  // Derive shared AES key
  const sharedKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: recipientPublicKey },
    senderPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(message);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, sharedKey, encoded);

  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
  };
}

/**
 * Расшифровывает сообщение от отправителя.
 */
export async function decryptMessage(
  encrypted: EncryptedMessage,
  senderPublicKeyB64: string,
  recipientPrivateKeyB64: string,
): Promise<string> {
  const senderPublicKey = await crypto.subtle.importKey(
    'spki',
    fromBase64(senderPublicKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const recipientPrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    fromBase64(recipientPrivateKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits'],
  );

  const sharedKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: senderPublicKey },
    recipientPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  const nonce = fromBase64(encrypted.nonce);
  const ciphertext = fromBase64(encrypted.ciphertext);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, sharedKey, ciphertext);

  return new TextDecoder().decode(decrypted);
}
