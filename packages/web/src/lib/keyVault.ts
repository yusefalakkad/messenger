/**
 * Хранилище приватного E2E-ключа на устройстве.
 *
 * Архитектура:
 *  • localStorage  enc_pk:{userId}   — зашифрованный AES-GCM (KEK = PBKDF2 от пароля)
 *  • sessionStorage pk:{userId}      — плейнтекст, живёт только в текущей вкладке/сессии
 *
 * Поток:
 *  • Регистрация — encryptAndStore(...) сохраняет оба
 *  • Логин — getPlaintext(userId) или decryptAndStore(...) с введённым паролем
 *  • Перезагрузка страницы — getPlaintext подхватывает из sessionStorage без запроса пароля
 *  • Закрытие вкладки → новая сессия → sessionStorage пуст → нужен пароль (т.е. логин)
 */

const PBKDF2_ITERATIONS = 250_000;
const KEY_LENGTH = 256;

interface EncryptedKeyBlob {
  v: 1;
  salt:       string; // base64
  nonce:      string; // base64
  ciphertext: string; // base64
  iter:       number;
}

// ─── Base64 утилиты ──────────────────────────────────────────────────────────

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

// ─── KEK derivation ───────────────────────────────────────────────────────────

async function deriveKEK(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ─── Encrypt / Decrypt ───────────────────────────────────────────────────────

async function encryptPrivateKey(privateKey: string, password: string): Promise<EncryptedKeyBlob> {
  const salt  = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const kek   = await deriveKEK(password, salt, PBKDF2_ITERATIONS);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource },
    kek,
    new TextEncoder().encode(privateKey) as BufferSource,
  );
  return {
    v: 1,
    salt:       bytesToB64(salt),
    nonce:      bytesToB64(nonce),
    ciphertext: bytesToB64(new Uint8Array(cipherBuf)),
    iter:       PBKDF2_ITERATIONS,
  };
}

async function decryptPrivateKey(blob: EncryptedKeyBlob, password: string): Promise<string> {
  const salt  = b64ToBytes(blob.salt);
  const nonce = b64ToBytes(blob.nonce);
  const ct    = b64ToBytes(blob.ciphertext);
  const kek   = await deriveKEK(password, salt, blob.iter);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, kek, ct as BufferSource);
  return new TextDecoder().decode(plainBuf);
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

const encKey = (userId: string) => `enc_pk:${userId}`;
const memKey = (userId: string) => `pk:${userId}`;

function safeGet(storage: Storage | undefined, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}
function safeSet(storage: Storage | undefined, key: string, val: string): void {
  try { storage?.setItem(key, val); } catch { /* инкогнито */ }
}
function safeRemove(storage: Storage | undefined, key: string): void {
  try { storage?.removeItem(key); } catch { /* инкогнито */ }
}

// ─── Публичный API ───────────────────────────────────────────────────────────

/** Сохранить приватный ключ под паролем (вызывается при регистрации). */
export async function encryptAndStore(userId: string, privateKey: string, password: string): Promise<void> {
  const blob = await encryptPrivateKey(privateKey, password);
  safeSet(localStorage, encKey(userId), JSON.stringify(blob));
  safeSet(sessionStorage, memKey(userId), privateKey);
}

/** Расшифровать сохранённый ключ паролем и закешировать в session (вызывается при логине). */
export async function decryptAndCache(userId: string, password: string): Promise<string | null> {
  const raw = safeGet(localStorage, encKey(userId));
  if (!raw) return null;
  try {
    const blob = JSON.parse(raw) as EncryptedKeyBlob;
    const privateKey = await decryptPrivateKey(blob, password);
    safeSet(sessionStorage, memKey(userId), privateKey);
    return privateKey;
  } catch {
    return null; // неверный пароль или повреждённый блок
  }
}

/** Положить приватный ключ в sessionStorage без пароля (phone-auth flow).
 *  После reload вкладки auth.store onRehydrateStorage подхватит его через getCached.
 *  ВАЖНО: ключ всё ещё легко читается из sessionStorage скриптами на той же origin —
 *  единственная защита это `script-src 'self'` CSP. Закрытие вкладки → ключ потерян,
 *  юзер должен пере-логиниться (это by design phone-auth). */
export function cachePlaintext(userId: string, privateKey: string): void {
  safeSet(sessionStorage, memKey(userId), privateKey);
}

/** Получить плейнтекст из sessionStorage. Возвращает null если сессия новая. */
export function getCached(userId: string): string | null {
  return safeGet(sessionStorage, memKey(userId));
}

/** Очистить sessionStorage-кэш (logout). LocalStorage не трогаем. */
export function clearCache(userId?: string): void {
  if (userId) {
    safeRemove(sessionStorage, memKey(userId));
    return;
  }
  // Без userId — чистим всё, что начинается с pk:
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith('pk:')) keys.push(k);
    }
    keys.forEach((k) => safeRemove(sessionStorage, k));
  } catch { /* */ }
}

/** Полностью удалить ключ устройства (deletion, "забыть аккаунт"). */
export function forgetDevice(userId: string): void {
  safeRemove(localStorage, encKey(userId));
  safeRemove(sessionStorage, memKey(userId));
}

/** Есть ли вообще шифрованный блок для этого юзера в localStorage. */
export function hasEncryptedKey(userId: string): boolean {
  return safeGet(localStorage, encKey(userId)) !== null;
}

/** Миграция: если в localStorage есть старый plaintext-ключ из zustand persist, перешифровать. */
export async function migrateLegacyKey(userId: string, password: string, legacyKey: string): Promise<void> {
  await encryptAndStore(userId, legacyKey, password);
}
