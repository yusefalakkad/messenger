import SwiftUI

/// Модалка пересылки: показывает все чаты, тап → отправить туда + закрыть.
struct ForwardSheet: View {
    let message: Message
    let onForward: (Chat) -> Void

    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm = ChatListViewModel()

    var body: some View {
        ZStack {
            Color.darkBg.opacity(0.7).ignoresSafeArea()

            VStack(spacing: 0) {
                header
                searchBar
                content
            }
        }
        .preferredColorScheme(.dark)
        .task { await vm.load() }
    }

    private var header: some View {
        HStack {
            Text("Переслать")
                .font(Typo.titleM)
                .foregroundStyle(.white)
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 32, height: 32)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())
            }
            .buttonStyle(PressDownStyle())
        }
        .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 12)
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.white.opacity(0.4))
            TextField("Поиск чата…", text: $vm.search)
                .font(Typo.body)
                .foregroundStyle(.white)
                .tint(.brandViolet)
                .textInputAutocapitalization(.never)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Color.white.opacity(0.04))
        .overlay(Capsule().stroke(Color.white.opacity(0.07), lineWidth: 1))
        .clipShape(Capsule())
        .padding(.horizontal, 16).padding(.bottom, 12)
    }

    @ViewBuilder
    private var content: some View {
        if vm.loading && vm.chats.isEmpty {
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(0..<5, id: \.self) { _ in
                        ChatRowSkeleton().padding(.horizontal, 12)
                    }
                }
            }
        } else if vm.filtered.isEmpty {
            EmptyState(iconName: "tray", title: "Нет чатов")
        } else {
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(vm.filtered) { chat in
                        Button {
                            onForward(chat)
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                Avatar(
                                    url: chat.displayAvatar(currentUserId: auth.user?.id),
                                    name: chat.displayName(currentUserId: auth.user?.id),
                                    size: 42,
                                    online: chat.type == .direct ? chat.isOnline(currentUserId: auth.user?.id) : nil
                                )
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(chat.displayName(currentUserId: auth.user?.id))
                                        .font(Typo.bodyB)
                                        .foregroundStyle(.white)
                                    if chat.type == .group {
                                        Text("\(chat.members.count) участн.")
                                            .font(.system(size: 12))
                                            .foregroundStyle(.white.opacity(0.4))
                                    } else if let other = chat.members.first(where: { $0.userId != auth.user?.id }) {
                                        Text("@\(other.user.username)")
                                            .font(.system(size: 12))
                                            .foregroundStyle(.white.opacity(0.4))
                                    }
                                }
                                Spacer()
                                Image(systemName: "arrowshape.turn.up.right")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Color.brandViolet.opacity(0.7))
                            }
                            .padding(.vertical, 10).padding(.horizontal, 12)
                            .background(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(Color.white.opacity(0.03))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                                            .stroke(Color.white.opacity(0.05), lineWidth: 1)
                                    )
                            )
                        }
                        .buttonStyle(PressDownStyle())
                    }
                }
                .padding(.horizontal, 12).padding(.bottom, 24)
            }
        }
    }
}
