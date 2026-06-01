package online.akkdmsg.dakka.data

import kotlinx.serialization.Serializable

/**
 * Базовые модели — синхронны с backend и iOS/web клиентами.
 */

@Serializable
data class User(
    val id: String,
    val username: String,
    val displayName: String,
    val avatar: String? = null,
    val status: String? = null,
    val publicKey: String? = null,
)

@Serializable
data class AuthTokens(
    val accessToken: String,
)

@Serializable
data class LoginRequest(
    val login: String,
    val password: String,
    val deviceId: String,
    val deviceName: String,
)

@Serializable
data class RegisterRequest(
    val username: String,
    val displayName: String,
    val password: String,
    val phone: String? = null,
    val publicKey: String? = null,
)

@Serializable
data class AuthResponse(
    val user: User,
    val tokens: AuthTokens,
    val twoFactorRequired: Boolean? = null,
    val twoFactorToken: String? = null,
)

/** Стандартный envelope бэка: { success, data, error }. */
@Serializable
data class ApiEnvelope<T>(
    val success: Boolean = true,
    val data: T? = null,
    val error: ApiError? = null,
)

@Serializable
data class ApiError(
    val code: String? = null,
    val message: String? = null,
)
