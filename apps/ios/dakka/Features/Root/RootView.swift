import SwiftUI

/// Корневой роутер. Поверх ChatList/Auth может быть оверлей звонка.
struct RootView: View {
    @EnvironmentObject var auth: AuthStore
    @ObservedObject private var callStore = CallStore.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            Group {
                if auth.isAuthenticated {
                    ChatListView()
                        // Используем только opacity — move-transition оставлял
                        // постоянный horizontal offset из-за бага SwiftUI с GeometryReader.
                        .transition(.opacity)
                } else {
                    AuthView()
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.25), value: auth.isAuthenticated)

            callOverlay

            // Privacy cover: скрываем содержимое в task-switcher / при потере фокуса.
            PrivacyCoverView()
                .opacity(scenePhase == .active ? 0 : 1)
                .animation(.easeInOut(duration: 0.18), value: scenePhase)
                .allowsHitTesting(scenePhase != .active)
                .zIndex(300)

            // Toast'ы поверх всего, включая звонки
            ToastHost()
                .zIndex(200)
                .allowsHitTesting(true)
        }
    }

    @ViewBuilder
    private func PrivacyCoverView() -> some View {
        ZStack {
            AmbientBackground()
                .ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 56, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.92))
                Text("Dakka")
                    .font(.system(size: 32, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
            }
        }
    }

    @ViewBuilder
    private var callOverlay: some View {
        switch callStore.state {
        case .idle:
            EmptyView()
        case .incoming(let info):
            IncomingCallView(info: info)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(100)
        case .outgoing(let info):
            ActiveCallView(info: info, isOutgoing: true)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(100)
        case .active(let info):
            ActiveCallView(info: info, isOutgoing: false)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(100)
        }
    }
}
