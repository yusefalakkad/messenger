import Foundation
import Combine

/// Глобальное состояние авторизации, аналог zustand auth.store на вебе.
/// Используется в SwiftUI через @EnvironmentObject / @StateObject.
@MainActor
final class AuthStore: ObservableObject {
    @Published var user: User?
    @Published var accessToken: String?
    @Published var isLoading: Bool = false

    var isAuthenticated: Bool { user != nil && accessToken != nil }

    init() {
        // Восстанавливаем сохранённую сессию
        if let token = KeychainStore.get(KeychainStore.Keys.accessToken),
           let userData = KeychainStore.get(KeychainStore.Keys.user)?.data(using: .utf8),
           let decoded = try? JSONDecoder().decode(User.self, from: userData) {
            self.accessToken = token
            self.user = decoded
            // Авто-подключение WebSocket при восстановлении сессии
            SocketClient.shared.connect()
            // И пере-регистрация APNs-токена (на случай если устройство сменилось)
            Task { await PushManager.shared.requestAuthorizationAndRegister() }
        }
        // APIClient читает токен прямо из Keychain — синхронизация не нужна.
    }

    func setAuth(user: User, accessToken: String, privateKey: String? = nil) {
        self.user = user
        self.accessToken = accessToken
        KeychainStore.set(accessToken, for: KeychainStore.Keys.accessToken)
        if let json = try? JSONEncoder().encode(user),
           let str  = String(data: json, encoding: .utf8) {
            KeychainStore.set(str, for: KeychainStore.Keys.user)
        }
        if let pk = privateKey {
            KeychainStore.set(pk, for: KeychainStore.Keys.privateKey)
        }
        SocketClient.shared.connect()
        // После логина просим разрешение на push и регистрируемся в APNs.
        Task { await PushManager.shared.requestAuthorizationAndRegister() }
    }

    /// E2E-приватный ключ текущего юзера (если есть).
    var privateKey: String? {
        KeychainStore.get(KeychainStore.Keys.privateKey)
    }

    func logout() {
        SocketClient.shared.disconnect()
        self.user = nil
        self.accessToken = nil
        KeychainStore.delete(KeychainStore.Keys.accessToken)
        KeychainStore.delete(KeychainStore.Keys.user)
        E2E.clearCache()
        // Приватный E2E-ключ оставляем — пригодится для расшифровки старых сообщений
        // при повторном логине того же юзера на этом устройстве.
    }

    /// Уникальный ID устройства — генерим один раз, сохраняем в Keychain.
    var deviceId: String {
        if let existing = KeychainStore.get(KeychainStore.Keys.deviceId) {
            return existing
        }
        let new = UUID().uuidString
        KeychainStore.set(new, for: KeychainStore.Keys.deviceId)
        return new
    }
}
