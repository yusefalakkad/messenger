import Foundation
import CryptoKit

/// E2E-шифрование, бит-в-бит совместимое с веб-клиентом
/// (`packages/web/src/lib/crypto.ts` + `e2e.ts`).
///
/// Алгоритм:
/// - **Обмен ключами**: ECDH P-256 (NIST). Веб использует WebCrypto
///   `ECDH P-256`, у нас — CryptoKit `P256.KeyAgreement`.
/// - **Симметричное шифрование**: AES-256-GCM. Веб использует
///   `AES-GCM 256bit`, у нас — `CryptoKit.AES.GCM`.
/// - **Дериваця AES-ключа**: WebCrypto при `deriveKey(ECDH → AES-GCM)`
///   берёт **X-координату ECDH-секрета** напрямую как AES-ключ
///   (без HKDF). У `P256.KeyAgreement.SharedSecret` это ровно 32 байта —
///   они и есть AES-ключ.
/// - **Кодирование ключей**: SPKI для публичного, PKCS#8 для приватного,
///   обёрнутые в base64. CryptoKit отдаёт `derRepresentation` именно в этих
///   форматах — interop гарантирован.
enum E2E {

    // MARK: - Errors

    enum CryptoError: LocalizedError {
        case invalidPrivateKey
        case invalidPublicKey
        case invalidCiphertext
        case decryptionFailed

        var errorDescription: String? {
            switch self {
            case .invalidPrivateKey:  return "Некорректный приватный ключ"
            case .invalidPublicKey:   return "Некорректный публичный ключ"
            case .invalidCiphertext:  return "Некорректный шифртекст"
            case .decryptionFailed:   return "Не удалось расшифровать сообщение"
            }
        }
    }

    // MARK: - Key generation

    struct KeyPair {
        let publicKeyB64:  String
        let privateKeyB64: String
    }

    static func generateKeyPair() -> KeyPair {
        let priv = P256.KeyAgreement.PrivateKey()
        return KeyPair(
            publicKeyB64:  priv.publicKey.derRepresentation.base64EncodedString(),
            privateKeyB64: priv.derRepresentation.base64EncodedString()
        )
    }

    // MARK: - Encryption

    struct Encrypted {
        let ciphertextB64: String
        let nonceB64:      String
    }

    /// Шифрует UTF-8 текст. Возвращает (ciphertext, nonce) — оба base64.
    /// `senderPrivateKeyB64`, `recipientPublicKeyB64` — те же base64-форматы,
    /// что отдаёт `generateKeyPair`.
    static func encryptText(
        _ plaintext: String,
        recipientPublicKeyB64: String,
        senderPrivateKeyB64: String
    ) throws -> Encrypted {
        let sharedKey = try deriveSharedKey(
            theirPublicKeyB64: recipientPublicKeyB64,
            myPrivateKeyB64:   senderPrivateKeyB64
        )

        // WebCrypto AES-GCM nonce — 96 бит / 12 байт
        let nonce = AES.GCM.Nonce()
        let sealed = try AES.GCM.seal(
            Data(plaintext.utf8),
            using: sharedKey,
            nonce: nonce
        )
        // sealed.ciphertext — голый шифртекст БЕЗ tag,
        // sealed.tag — 16 байт authenticator.
        // WebCrypto AES-GCM по умолчанию конкатенирует ciphertext+tag,
        // поэтому склеиваем тоже.
        let combined = sealed.ciphertext + sealed.tag
        return Encrypted(
            ciphertextB64: combined.base64EncodedString(),
            nonceB64:      Data(nonce).base64EncodedString()
        )
    }

    /// Расшифровывает. Возвращает текст или бросает.
    static func decryptText(
        ciphertextB64: String,
        nonceB64: String,
        senderPublicKeyB64: String,
        recipientPrivateKeyB64: String
    ) throws -> String {
        guard let cipher = Data(base64Encoded: ciphertextB64),
              let nonceData = Data(base64Encoded: nonceB64)
        else { throw CryptoError.invalidCiphertext }

        // WebCrypto-encoded: последние 16 байт — это GCM-tag.
        guard cipher.count > 16 else { throw CryptoError.invalidCiphertext }
        let tag = cipher.suffix(16)
        let ct  = cipher.prefix(cipher.count - 16)

        let nonce = try AES.GCM.Nonce(data: nonceData)
        let sharedKey = try deriveSharedKey(
            theirPublicKeyB64: senderPublicKeyB64,
            myPrivateKeyB64:   recipientPrivateKeyB64
        )

        let box = try AES.GCM.SealedBox(nonce: nonce, ciphertext: ct, tag: tag)
        let plain: Data
        do {
            plain = try AES.GCM.open(box, using: sharedKey)
        } catch {
            throw CryptoError.decryptionFailed
        }

        guard let str = String(data: plain, encoding: .utf8) else {
            throw CryptoError.decryptionFailed
        }
        return str
    }

    // MARK: - Internal: shared key derivation + cache

    /// Кэш выведенных AES-ключей — экономит ECDH-операции при потоке сообщений.
    /// Ключ кэша: SHA-256 от ПОЛНОГО `theirPublicKeyB64`.
    ///
    /// CRITICAL: раньше использовалось `prefix(16)`. У всех P-256 SPKI base64
    /// первые ~36 символов идентичны (DER-префикс алгоритма), поэтому prefix
    /// возвращал бы одинаковую строку для разных пиров → cross-chat
    /// confidentiality break (один derived key для всех чатов).
    private static var sharedKeyCache: [String: SymmetricKey] = [:]
    private static let cacheLock = NSLock()

    private static func cacheKey(forPublicKey b64: String) -> String {
        let data = Data(b64.utf8)
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private static func deriveSharedKey(
        theirPublicKeyB64: String,
        myPrivateKeyB64: String
    ) throws -> SymmetricKey {
        let cacheKey = Self.cacheKey(forPublicKey: theirPublicKeyB64)
        cacheLock.lock(); defer { cacheLock.unlock() }
        if let cached = sharedKeyCache[cacheKey] { return cached }

        guard let theirPubData = Data(base64Encoded: theirPublicKeyB64)
        else { throw CryptoError.invalidPublicKey }
        guard let myPrivData = Data(base64Encoded: myPrivateKeyB64)
        else { throw CryptoError.invalidPrivateKey }

        let theirPub: P256.KeyAgreement.PublicKey
        do {
            theirPub = try P256.KeyAgreement.PublicKey(derRepresentation: theirPubData)
        } catch { throw CryptoError.invalidPublicKey }

        let myPriv: P256.KeyAgreement.PrivateKey
        do {
            myPriv = try P256.KeyAgreement.PrivateKey(derRepresentation: myPrivData)
        } catch { throw CryptoError.invalidPrivateKey }

        let shared = try myPriv.sharedSecretFromKeyAgreement(with: theirPub)

        // X-координата (32 байта для P-256) — напрямую как AES-256 key.
        // SharedSecret конформит ContiguousBytes.
        let key: SymmetricKey = shared.withUnsafeBytes { rawBuf in
            SymmetricKey(data: Data(rawBuf))
        }

        sharedKeyCache[cacheKey] = key
        return key
    }

    /// Очистить кэш — вызывать при logout.
    static func clearCache() {
        cacheLock.lock(); defer { cacheLock.unlock() }
        sharedKeyCache.removeAll()
    }

    /// Полная очистка кэша — вызывать при logout.
    static func clearCache() {
        cacheLock.lock(); defer { cacheLock.unlock() }
        sharedKeyCache.removeAll()
    }
}
