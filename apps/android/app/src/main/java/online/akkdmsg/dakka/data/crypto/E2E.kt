package online.akkdmsg.dakka.data.crypto

import android.util.Base64
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * E2E-шифрование Android-клиента — байт-в-байт совместимое с iOS (CryptoKit)
 * и web (WebCrypto).
 *
 * Алгоритм:
 *   • ECDH P-256 (secp256r1) для обмена ключами
 *   • AES-256-GCM для симметричного шифрования
 *   • Raw X-coordinate (32 байта) ECDH-секрета используется как AES-key
 *     БЕЗ HKDF — потому что так делает WebCrypto AES-GCM deriveKey.
 *
 * Форматы ключей (для interop):
 *   • Public:  SPKI (X.509 encoded), base64
 *   • Private: PKCS#8, base64
 *   Это нативные форматы Android JCA + WebCrypto + CryptoKit derRepresentation.
 *
 * AES-GCM:
 *   • Nonce 12 байт (96 бит) — стандарт для GCM
 *   • Output WebCrypto: ciphertext || tag (где tag 16 байт) — JCA по умолчанию
 *     возвращает ровно это же.
 */
object E2E {

    sealed class CryptoError(msg: String) : Exception(msg) {
        object InvalidPrivateKey : CryptoError("Некорректный приватный ключ")
        object InvalidPublicKey  : CryptoError("Некорректный публичный ключ")
        object InvalidCiphertext : CryptoError("Некорректный шифртекст")
        object DecryptionFailed  : CryptoError("Не удалось расшифровать сообщение")
    }

    data class KeyPair(val publicKeyB64: String, val privateKeyB64: String)
    data class Encrypted(val ciphertextB64: String, val nonceB64: String)

    private val keyFactory: KeyFactory = KeyFactory.getInstance("EC")

    private val sharedKeyCache: MutableMap<String, SecretKeySpec> = mutableMapOf()
    private val cacheLock = Any()
    private val secureRandom = SecureRandom()

    // MARK: - Key generation

    fun generateKeyPair(): KeyPair {
        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"))
        val pair = kpg.generateKeyPair()
        return KeyPair(
            publicKeyB64  = Base64.encodeToString(pair.public.encoded,  Base64.NO_WRAP),
            privateKeyB64 = Base64.encodeToString(pair.private.encoded, Base64.NO_WRAP),
        )
    }

    // MARK: - Encrypt

    @Throws(CryptoError::class)
    fun encryptText(
        plaintext: String,
        recipientPublicKeyB64: String,
        senderPrivateKeyB64: String,
    ): Encrypted {
        val sharedKey = deriveSharedKey(recipientPublicKeyB64, senderPrivateKeyB64)
        val nonce = ByteArray(12).also(secureRandom::nextBytes)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, sharedKey, GCMParameterSpec(128, nonce))
        val combined = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        // JCA AES/GCM/NoPadding по умолчанию даёт ciphertext || 16-byte tag — то же
        // что WebCrypto. Совместимо.

        return Encrypted(
            ciphertextB64 = Base64.encodeToString(combined, Base64.NO_WRAP),
            nonceB64      = Base64.encodeToString(nonce,    Base64.NO_WRAP),
        )
    }

    // MARK: - Decrypt

    @Throws(CryptoError::class)
    fun decryptText(
        ciphertextB64: String,
        nonceB64: String,
        senderPublicKeyB64: String,
        recipientPrivateKeyB64: String,
    ): String {
        val ciphertext = runCatching { Base64.decode(ciphertextB64, Base64.NO_WRAP) }
            .getOrElse { throw CryptoError.InvalidCiphertext }
        val nonce = runCatching { Base64.decode(nonceB64, Base64.NO_WRAP) }
            .getOrElse { throw CryptoError.InvalidCiphertext }
        if (ciphertext.size <= 16) throw CryptoError.InvalidCiphertext

        val sharedKey = deriveSharedKey(senderPublicKeyB64, recipientPrivateKeyB64)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, sharedKey, GCMParameterSpec(128, nonce))

        val plain = try {
            cipher.doFinal(ciphertext)
        } catch (_: Exception) {
            throw CryptoError.DecryptionFailed
        }
        return String(plain, Charsets.UTF_8)
    }

    // MARK: - Shared key (ECDH P-256) с кэшем

    @Throws(CryptoError::class)
    private fun deriveSharedKey(
        theirPublicKeyB64: String,
        myPrivateKeyB64: String,
    ): SecretKeySpec {
        // CRITICAL: cache key должен зависеть ОТ ВСЕГО публичного ключа.
        // У всех P-256 SPKI base64 первые ~36 символов идентичны (DER-префикс),
        // поэтому take(16) возвращал бы одинаковую строку для разных пиров
        // → cross-chat confidentiality break. Используем SHA-256(full pub).
        val cacheKey = sha256Hex(theirPublicKeyB64)
        synchronized(cacheLock) { sharedKeyCache[cacheKey] }?.let { return it }

        val theirPubBytes = runCatching { Base64.decode(theirPublicKeyB64, Base64.NO_WRAP) }
            .getOrElse { throw CryptoError.InvalidPublicKey }
        val myPrivBytes = runCatching { Base64.decode(myPrivateKeyB64, Base64.NO_WRAP) }
            .getOrElse { throw CryptoError.InvalidPrivateKey }

        val theirPub = runCatching {
            keyFactory.generatePublic(X509EncodedKeySpec(theirPubBytes))
        }.getOrElse { throw CryptoError.InvalidPublicKey }

        val myPriv = runCatching {
            keyFactory.generatePrivate(PKCS8EncodedKeySpec(myPrivBytes))
        }.getOrElse { throw CryptoError.InvalidPrivateKey }

        val agreement = KeyAgreement.getInstance("ECDH")
        agreement.init(myPriv)
        agreement.doPhase(theirPub, true)
        val sharedSecret = agreement.generateSecret()  // 32 байта X-coord для P-256

        val key = SecretKeySpec(sharedSecret, "AES")
        synchronized(cacheLock) { sharedKeyCache[cacheKey] = key }
        return key
    }

    /** Очистить кэш — вызывать при logout. */
    fun clearCache() {
        synchronized(cacheLock) { sharedKeyCache.clear() }
    }

    private fun sha256Hex(s: String): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        val digest = md.digest(s.toByteArray(Charsets.UTF_8))
        val sb = StringBuilder(digest.size * 2)
        for (b in digest) sb.append("%02x".format(b))
        return sb.toString()
    }
}
