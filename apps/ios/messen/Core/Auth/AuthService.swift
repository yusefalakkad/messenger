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
