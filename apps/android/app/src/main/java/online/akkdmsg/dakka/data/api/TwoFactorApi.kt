package online.akkdmsg.dakka.data.api

import kotlinx.serialization.Serializable

/** Клиент /auth/2fa/* — статус, setup, enable, disable. */
object TwoFactorApi {

    @Serializable
    data class StatusResponse(
        val enabled: Boolean,
        val remainingRecoveryCodes: Int,
    )

    @Serializable
    data class SetupResponse(
        val secret: String,
        val otpauthUrl: String,
    )

    @Serializable
    data class EnableResponse(
        val enabled: Boolean,
        val recoveryCodes: List<String>,
    )

    @Serializable
    data class DisableResponse(
        val enabled: Boolean,
    )

    @Serializable
    data class EnableRequest(val code: String)

    @Serializable
    data class DisableRequest(val password: String, val code: String)

    suspend fun status(): StatusResponse =
        ApiClient.get("auth/2fa/status")

    suspend fun setup(): SetupResponse =
        ApiClient.post<Unit, SetupResponse>("auth/2fa/setup", null)

    suspend fun enable(code: String): EnableResponse =
        ApiClient.post<EnableRequest, EnableResponse>("auth/2fa/enable", EnableRequest(code))

    suspend fun disable(password: String, code: String): DisableResponse =
        ApiClient.post<DisableRequest, DisableResponse>(
            "auth/2fa/disable",
            DisableRequest(password, code),
        )
}
