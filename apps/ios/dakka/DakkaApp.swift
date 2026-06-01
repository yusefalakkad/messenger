import SwiftUI

@main
struct DakkaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var auth = AuthStore()

    init() {
        // Принудительно тёмная тема навигации
        UINavigationBar.appearance().tintColor = UIColor(Color.brandViolet)
        // Явная инициализация CallManager — он подпишется на сокет до первого звонка
        _ = CallManager.shared
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .preferredColorScheme(.dark)
        }
    }
}
