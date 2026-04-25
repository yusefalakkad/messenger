/**
 * End-to-End Encryption using libsodium (X25519 key exchange + XSalsa20-Poly1305)
 *
 * Security model:
 * - Each user generates an X25519 key pair on their device
 * - Private key NEVER leaves the device
 * - Public key is stored on the server
 * - Messages encrypted with shared secret derived from Diffie-Hellman
 * - Each message has a unique nonce — no nonce reuse possible
 *
 * This is equivalent to NaCl box encryption, similar to what Signal uses
 * for initial key exchange.
 */

import sodium from 'libsodium-wrappers';

export interface KeyPair {
  publicKey: string;  // base64
  privateKey: string; // base64 — NEVER send to server
}

export interface EncryptedMessage {
  ciphertext: string; // base64
  nonce: string;      // base64
}

let sodiumReady = false;

async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

/**
 * Generate a new X25519 key pair for a user.
 * Call this once on registration — store privateKey securely on device only.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  await ensureSodium();
  const keypair = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(keypair.publicKey),
    privateKey: sodium.to_base64(keypair.privateKey),
  };
}

/**
 * Encrypt a message for a recipient.
 * @param message     Plaintext message
 * @param recipientPublicKey  Recipient's X25519 public key (base64)
 * @param senderPrivateKey    Sender's X25519 private key (base64)
 */
export async function encryptMessage(
  message: string,
  recipientPublicKey: string,
  senderPrivateKey: string,
): Promise<EncryptedMessage> {
  await ensureSodium();

  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const recipientPubKeyBytes = sodium.from_base64(recipientPublicKey);
  const senderPrivKeyBytes = sodium.from_base64(senderPrivateKey);
  const messageBytes = sodium.from_string(message);

  const ciphertext = sodium.crypto_box_easy(
    messageBytes,
    nonce,
    recipientPubKeyBytes,
    senderPrivKeyBytes,
  );

  return {
    ciphertext: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
  };
}

/**
 * Decrypt a message from a sender.
 */
export async function decryptMessage(
  encrypted: EncryptedMessage,
  senderPublicKey: string,
  recipientPrivateKey: string,
): Promise<string> {
  await ensureSodium();

  const ciphertextBytes = sodium.from_base64(encrypted.ciphertext);
  const nonceBytes = sodium.from_base64(encrypted.nonce);
  const senderPubKeyBytes = sodium.from_base64(senderPublicKey);
  const recipientPrivKeyBytes = sodium.from_base64(recipientPrivateKey);

  const decrypted = sodium.crypto_box_open_easy(
    ciphertextBytes,
    nonceBytes,
    senderPubKeyBytes,
    recipientPrivKeyBytes,
  );

  return sodium.to_string(decrypted);
}

/**
 * Encrypt a session key for a group member.
 * Used for group chats: one symmetric key per group, encrypted per member.
 */
export async function encryptSessionKey(
  sessionKey: Uint8Array,
  recipientPublicKey: string,
  senderPrivateKey: string,
): Promise<EncryptedMessage> {
  await ensureSodium();

  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const recipientPubKeyBytes = sodium.from_base64(recipientPublicKey);
  const senderPrivKeyBytes = sodium.from_base64(senderPrivateKey);

  const ciphertext = sodium.crypto_box_easy(
    sessionKey,
    nonce,
    recipientPubKeyBytes,
    senderPrivKeyBytes,
  );

  return {
    ciphertext: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
  };
}

/**
 * Generate a random symmetric session key for group chats.
 */
export async function generateSessionKey(): Promise<string> {
  await ensureSodium();
  const key = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
  return sodium.to_base64(key);
}
