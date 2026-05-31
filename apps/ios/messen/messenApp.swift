import SwiftUI

@main
struct MessenApp: App {
    @StateObject private var auth = AuthStore()

    init() {
        // Принудительно тёмная тема навигации
        UINavigationBar.appearance().tintColor = UIColor(Color.brandViolet)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .preferredColorScheme(.dark)
        }
    }
}
