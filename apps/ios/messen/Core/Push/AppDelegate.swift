import UIKit
import UserNotifications

/// Минимальный UIApplicationDelegate.
/// SwiftUI-приложение использует @main, но для APNs callbacks
/// нужен полноценный AppDelegate, подключенный через @UIApplicationDelegateAdaptor.
final class AppDelegate: NSObject, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Если приложение было запущено через тап по уведомлению —
        // запомним chatId сразу, чтобы передать в навигацию когда View
        // прогрузятся.
        if let notif = launchOptions?[.remoteNotification] as? [String: Any],
           let chatId = notif["chatId"] as? String {
            Task { @MainActor in
                PushManager.shared.openChatRequested.send(chatId)
            }
        }
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            guard let userId = AuthStore.cachedUserId else { return }
            PushManager.shared.registerDeviceToken(deviceToken, userId: userId)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in
            PushManager.shared.didFailRegistration(error)
        }
    }
}

// MARK: - AuthStore helper

extension AuthStore {
    /// Безопасное чтение userId без зависимости от @MainActor.
    /// Берём из Keychain user.json — то же что в init.
    static var cachedUserId: String? {
        guard let raw = KeychainStore.get(KeychainStore.Keys.user)?.data(using: .utf8),
              let user = try? JSONDecoder().decode(User.self, from: raw)
        else { return nil }
        return user.id
    }
}
