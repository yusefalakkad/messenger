import SwiftUI

/// Корневой роутер: показывает либо AuthView, либо ChatListView.
struct RootView: View {
    @EnvironmentObject var auth: AuthStore

    var body: some View {
        Group {
            if auth.isAuthenticated {
                ChatListView()
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
            } else {
                AuthView()
                    .transition(.opacity.combined(with: .move(edge: .leading)))
            }
        }
        .animation(.easeInOut(duration: 0.35), value: auth.isAuthenticated)
    }
}
