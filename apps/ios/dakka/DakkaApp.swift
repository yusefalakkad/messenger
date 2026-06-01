import SwiftUI

@main
struct DakkaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var auth = AuthStore()

    init() {
        // Принудительно тёмная тема навигации
        UINavigationBar.appearance().tintColor = UIColor(Color.brandViolet)
        // Явные инициализации синглтонов, чтобы они подписались на сокет/PushKit
        // ДО прихода первого события
        _ = CallManager.shared
        _ = CallKitProvider.shared
        PushKitManager.shared.start()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .preferredColorScheme(.dark)
        }
    }
}
