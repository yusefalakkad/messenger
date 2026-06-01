package online.akkdmsg.dakka.data.api

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
}
