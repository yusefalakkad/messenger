package online.akkdmsg.dakka.data.api

import kotlinx.serialization.Serializable
import online.akkdmsg.dakka.data.*

object AuthApi {

    suspend fun login(
        login: String,
        password: String,
        deviceId: String,
        deviceName: String,
    ): AuthResponse = ApiClient.post(
        path = "auth/login",
        body = LoginRequest(login, password, deviceId, deviceName),
        requireAuth = false,
    )

    suspend fun register(
        username: String,
        displayName: String,
        password: String,
        phone: String?,
        publicKey: String?,
    ): AuthResponse = ApiClient.post(
        path = "auth/register",
        body = RegisterRequest(username, displayName, password, phone, publicKey),
        requireAuth = false,
    )

    // ─── Phone-OTP auth (новый основной флоу) ─────────────────────────────────

    @Serializable
    data class PhoneRequestBody(val phone: String)

    @Serializable
    data class PhoneRequestResponse(
        val cooldownSec: Int,
        val devOtp: String? = null,
        val telegramDeepLink: String? = null,
    )

    @Serializable
    data class PhoneVerifyBody(
        val phone: String,
        val code: String,
        val deviceId: String,
        val deviceName: String,
    )

    @Serializable
    data class PhoneVerifyResponse(
        val isNewUser: Boolean,
        val verifyToken: String? = null,
        val tokens: TokensWithUser? = null,
    )

    @Serializable
    data class TokensWithUser(
        val accessToken: String,
        val refreshToken: String,
        val expiresIn: Int,
        val user: User,
    )

    @Serializable
    data class PhoneCompleteBody(
        val verifyToken: String,
        val displayName: String,
        val username: String? = null,
        val publicKey: String,
        val deviceId: String,
        val deviceName: String,
    )

    @Serializable
    data class PhoneCompleteResponse(
        val user: User,
        val tokens: TokensPayload,
    )

    @Serializable
    data class TokensPayload(
        val accessToken: String,
        val refreshToken: String,
        val expiresIn: Int,
    )

    suspend fun phoneRequestCode(phone: String): PhoneRequestResponse =
        ApiClient.post(
            path = "auth/phone/request",
            body = PhoneRequestBody(phone),
            requireAuth = false,
        )

    suspend fun phoneVerifyCode(
        phone: String,
        code: String,
        deviceId: String,
        deviceName: String,
    ): PhoneVerifyResponse =
        ApiClient.post(
            path = "auth/phone/verify",
            body = PhoneVerifyBody(phone, code, deviceId, deviceName),
            requireAuth = false,
        )

    suspend fun phoneCompleteProfile(
        verifyToken: String,
        displayName: String,
        username: String?,
        publicKey: String,
        deviceId: String,
        deviceName: String,
    ): PhoneCompleteResponse =
        ApiClient.post(
            path = "auth/phone/complete-profile",
            body = PhoneCompleteBody(
                verifyToken = verifyToken,
                displayName = displayName,
                username = username,
                publicKey = publicKey,
                deviceId = deviceId,
                deviceName = deviceName,
            ),
            requireAuth = false,
        )
}
