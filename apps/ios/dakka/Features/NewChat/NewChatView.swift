import SwiftUI

struct NewChatView: View {
    let onChatCreated: (Chat) -> Void

    @StateObject private var vm = NewChatViewModel()
    @Environment(\.dismiss) private var dismiss
    @FocusState private var searchFocused: Bool

    var body: some View {
        ZStack {
            Color.darkBg.opacity(0.7).ignoresSafeArea()

            VStack(spacing: 0) {
                header
                searchField
                content
            }
        }
        .preferredColorScheme(.dark)
        .onAppear { searchFocused = true }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("Новый чат")
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
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 12)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.white.opacity(0.4))
            TextField("Поиск пользователей по @username…", text: $vm.query)
                .font(Typo.body)
                .foregroundStyle(.white)
                .tint(.brandViolet)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($searchFocused)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.04))
        .overlay(Capsule().stroke(Color.white.opacity(0.07), lineWidth: 1))
        .clipShape(Capsule())
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if vm.loading && vm.results.isEmpty {
            VStack(spacing: 10) {
                ProgressView().tint(.brandViolet)
                Text("Ищем…")
                    .font(Typo.small)
                    .foregroundStyle(.white.opacity(0.4))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if vm.query.isEmpty {
            promptState
        } else if vm.results.isEmpty {
            emptyState
        } else {
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(vm.results) { user in
                        userRow(user)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 24)
            }
        }
    }

    private func userRow(_ user: User) -> some View {
        Button {
            Task {
                if let chat = await vm.createDirectChat(with: user.id) {
                    onChatCreated(chat)
                }
            }
        } label: {
            HStack(spacing: 12) {
                Avatar(url: user.avatar, name: user.displayName, size: 42, online: user.status == "online")

                VStack(alignment: .leading, spacing: 2) {
                    Text(user.displayName)
                        .font(Typo.bodyB)
                        .foregroundStyle(.white)
                    Text("@\(user.username)")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.45))
                }

                Spacer()

                if vm.creatingChatForUserId == user.id {
                    ProgressView().tint(.brandViolet)
                } else if user.publicKey != nil {
                    Image(systemName: "checkmark.shield.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.brandViolet)
                }
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
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
        .disabled(vm.creatingChatForUserId != nil)
    }

    private var promptState: some View {
        EmptyState(
            iconName: "person.crop.circle.badge.plus",
            title: "Найди собеседника",
            subtitle: "Введи @username или часть имени"
        )
    }

    private var emptyState: some View {
        EmptyState(
            iconName: "magnifyingglass",
            title: "Никого не нашлось",
            subtitle: "Попробуй другое имя"
        )
    }
}
