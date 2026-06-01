import Foundation
import UserNotifications
import Combine
import UIKit

/// APNs / UserNotifications менеджер.
///
/// • Запрашивает разрешение
/// • Принимает APNs device token из AppDelegate и шлёт на бэк
/// • Обрабатывает тапы по уведомлению (deep-link в чат)
/// • Эмитит событие `openChatRequested` — на него подписан RootView,
///   чтобы переключиться на нужный чат.
@MainActor
final class PushManager: NSObject, ObservableObject {
    static let shared = PushManager()

    /// Запрос на открытие чата из тапа по push-уведомлению.
    let openChatRequested = PassthroughSubject<String, Never>()

    /// Полученное в foreground уведомление — для UI-баннера.
    let foregroundNotification = PassthroughSubject<UNNotification, Never>()

    private var pendingChatIdToOpen: String?
    private var hasRegistered = false

    private override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    // MARK: - Authorization

    /// Запрос разрешения + регистрация на APNs.
    /// Вызывать после успешного логина (есть юзер).
    func requestAuthorizationAndRegister() async {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound, .providesAppNotificationSettings])
            guard granted else { return }
            await MainActor.run {
                UIApplication.shared.registerForRemoteNotifications()
                self.hasRegistered = true
            }
        } catch {
            print("[Push] Authorization error:", error)
        }
    }

    // MARK: - Device token

    /// Вызывается из AppDelegate.didRegisterForRemoteNotificationsWithDeviceToken.
    /// Отправляет токен на наш бэкенд → /push/native-token.
    func registerDeviceToken(_ tokenData: Data, userId: String) {
        let hex = tokenData.map { String(format: "%02x", $0) }.joined()
        Task {
            do {
                let _: Empty = try await APIClient.shared.post(
                    "push/native-token",
                    body: NativeTokenPayload(token: hex, platform: "ios")
                )
                print("[Push] Token registered with backend")
            } catch {
                print("[Push] Failed to register token:", error)
            }
        }
    }

    func didFailRegistration(_ error: Error) {
        print("[Push] APNs registration failed:", error)
    }

    /// Если на момент старта приложения уже был выполнен deep-link тап —
    /// View подписывается и вытягивает один раз.
    func consumePendingChatId() -> String? {
        defer { pendingChatIdToOpen = nil }
        return pendingChatIdToOpen
    }

    private struct NativeTokenPayload: Codable {
        let token: String
        let platform: String
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension PushManager: UNUserNotificationCenterDelegate {

    /// Уведомление пришло пока приложение на переднем плане — решаем,
    /// показывать ли его поверх UI.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        Task { @MainActor in
            self.foregroundNotification.send(notification)
        }
        // Показываем баннер всегда — пользователь может находиться на другом чате
        completionHandler([.banner, .list, .sound])
    }

    /// Тап по уведомлению из бэкграунда / lock screen.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let info = response.notification.request.content.userInfo
        let chatId = info["chatId"] as? String
        Task { @MainActor in
            if let chatId {
                self.pendingChatIdToOpen = chatId
                self.openChatRequested.send(chatId)
            }
            completionHandler()
        }
    }
}
