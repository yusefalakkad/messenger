import Foundation

/// Сетевой слой авторизации — login / register / refresh.
/// Бизнес-логика тонкая: вызов APIClient + сохранение токена через AuthStore.
enum AuthService {

    struct LoginRequest: Encodable {
        let login: String
        let password: String
        let deviceId: String
        let deviceName: String
    }

    struct RegisterRequest: Encodable {
        let username: String
        let displayName: String
        let password: String
        let phone: String?
        let publicKey: String?
    }

    struct TwoFactorVerifyRequest: Encodable {
        let twoFactorToken: String
        let code: String
    }

    static func login(login: String, password: String, deviceId: String) async throws -> LoginResponse {
        try await APIClient.shared.post(
            "auth/login",
            body: LoginRequest(
                login: login,
                password: password,
                deviceId: deviceId,
                deviceName: deviceName()
            )
        )
    }

    static func verify2FA(token: String, code: String) async throws -> LoginResponse {
        try await APIClient.shared.post(
            "auth/login/2fa",
            body: TwoFactorVerifyRequest(twoFactorToken: token, code: code)
        )
    }

    /// Генерирует пару E2E-ключей, отправляет публичный на сервер.
    /// Возвращает кортеж: (resp, privateKeyB64) — приватный надо сохранить в Keychain.
    static func register(username: String, displayName: String, password: String, phone: String?) async throws -> (resp: RegisterResponse, privateKeyB64: String) {
        let pair = E2E.generateKeyPair()
        let resp: RegisterResponse = try await APIClient.shared.post(
            "auth/register",
            body: RegisterRequest(
                username: username,
                displayName: displayName,
                password: password,
                phone: phone,
                publicKey: pair.publicKeyB64
            )
        )
        return (resp, pair.privateKeyB64)
    }

    // MARK: - Phone-OTP auth (новый основной флоу)

    struct PhoneRequestCodeRequest: Encodable {
        let phone: String
    }
    struct PhoneRequestCodeResponse: Decodable {
        let cooldownSec: Int
        let devOtp: String?
        let telegramDeepLink: String?
    }

    struct PhoneVerifyCodeRequest: Encodable {
        let phone: String
        let code: String
        let deviceId: String
        let deviceName: String
    }
    struct PhoneVerifyCodeResponse: Decodable {
        let isNewUser: Bool
        let verifyToken: String?
        let tokens: TokensWithUser?
    }
    struct TokensWithUser: Decodable {
        let accessToken: String
        let refreshToken: String
        let expiresIn: Int
        let user: User
    }

    struct PhoneCompleteProfileRequest: Encodable {
        let verifyToken: String
        let displayName: String
        let username: String?
        let publicKey: String
        let deviceId: String
        let deviceName: String
    }
    struct PhoneCompleteProfileResponse: Decodable {
        let user: User
        let tokens: TokensPayload
    }
    struct TokensPayload: Decodable {
        let accessToken: String
        let refreshToken: String
        let expiresIn: Int
    }

    /// Шаг 1: запросить код. Возвращает cooldown + опциональный deep-link для TG-бота.
    static func phoneRequestCode(phone: String) async throws -> PhoneRequestCodeResponse {
        try await APIClient.shared.post(
            "auth/phone/request",
            body: PhoneRequestCodeRequest(phone: phone)
        )
    }

    /// Шаг 2: проверить код. Может вернуть tokens (вход существующего юзера)
    /// или verifyToken (для нового юзера — нужен complete-profile).
    static func phoneVerifyCode(phone: String, code: String, deviceId: String) async throws -> PhoneVerifyCodeResponse {
        try await APIClient.shared.post(
            "auth/phone/verify",
            body: PhoneVerifyCodeRequest(
                phone: phone,
                code: code,
                deviceId: deviceId,
                deviceName: deviceName()
            )
        )
    }

    /// Шаг 3 (только для новых юзеров): заполнить displayName, username, publicKey.
    /// Возвращает финальную сессию + сгенерированный приватный ключ для Keychain.
    static func phoneCompleteProfile(
        verifyToken: String,
        displayName: String,
        username: String?,
        deviceId: String
    ) async throws -> (resp: PhoneCompleteProfileResponse, privateKeyB64: String) {
        let pair = E2E.generateKeyPair()
        let resp: PhoneCompleteProfileResponse = try await APIClient.shared.post(
            "auth/phone/complete-profile",
            body: PhoneCompleteProfileRequest(
                verifyToken: verifyToken,
                displayName: displayName,
                username: username,
                publicKey: pair.publicKeyB64,
                deviceId: deviceId,
                deviceName: deviceName()
            )
        )
        return (resp, pair.privateKeyB64)
    }

    private static func deviceName() -> String {
        #if canImport(UIKit)
        return "\(UIDevice.current.name) · \(UIDevice.current.systemName) \(UIDevice.current.systemVersion)"
        #else
        return "iOS"
        #endif
    }
}

#if canImport(UIKit)
import UIKit
#endif
