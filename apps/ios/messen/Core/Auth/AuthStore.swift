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
        }
        // APIClient читает токен прямо из Keychain — синхронизация не нужна.
    }

    func setAuth(user: User, accessToken: String) {
        self.user = user
        self.accessToken = accessToken
        KeychainStore.set(accessToken, for: KeychainStore.Keys.accessToken)
        if let json = try? JSONEncoder().encode(user),
           let str  = String(data: json, encoding: .utf8) {
            KeychainStore.set(str, for: KeychainStore.Keys.user)
        }
    }

    func logout() {
        self.user = nil
        self.accessToken = nil
        KeychainStore.delete(KeychainStore.Keys.accessToken)
        KeychainStore.delete(KeychainStore.Keys.user)
        // Приватный E2E-ключ можно оставить — он нужен для расшифровки старых сообщений после повторного логина.
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
