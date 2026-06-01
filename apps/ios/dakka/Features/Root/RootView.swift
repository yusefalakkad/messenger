import SwiftUI

/// Корневой роутер. Поверх ChatList/Auth может быть оверлей звонка.
struct RootView: View {
    @EnvironmentObject var auth: AuthStore
    @ObservedObject private var callStore = CallStore.shared

    var body: some View {
        ZStack {
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

            callOverlay
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
