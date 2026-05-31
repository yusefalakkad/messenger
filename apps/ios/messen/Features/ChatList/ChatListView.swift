import SwiftUI
import Combine

struct ChatListView: View {
    @EnvironmentObject var auth: AuthStore
    @StateObject private var vm = ChatListViewModel()

    @State private var path: [String] = []
    @State private var showNewChat = false

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                AmbientBackground()

                VStack(spacing: 0) {
                    header
                    searchBar
                    content
                }
            }
            .navigationBarHidden(true)
            .toolbar(.hidden, for: .navigationBar)
        }
        .preferredColorScheme(.dark)
        .task { await vm.load() }
        .refreshable { await vm.load() }
        // Deep-link от push: переключиться на нужный чат
        .onReceive(PushManager.shared.openChatRequested) { chatId in
            openChat(chatId)
        }
        .onAppear {
            if let pending = PushManager.shared.consumePendingChatId() {
                openChat(pending)
            }
        }
        // Свежее сообщение в любом чате — поднимаем чат вверх списка
        .onReceive(SocketClient.shared.messageReceived) { _ in
            Task { await vm.load() }
        }
        // Новый чат создан — добавим в список
        .onReceive(SocketClient.shared.chatCreated) { chat in
            vm.upsert(chat)
        }
        .sheet(isPresented: $showNewChat) {
            NewChatView(onChatCreated: { chat in
                vm.upsert(chat)
                showNewChat = false
                openChat(chat.id)
            })
            .environmentObject(auth)
            .presentationDetents([.large])
            .presentationBackground(.ultraThinMaterial)
        }
    }

    private func openChat(_ chatId: String) {
        // Если чата ещё нет в списке — подгрузим
        if !vm.chats.contains(where: { $0.id == chatId }) {
            Task { await vm.load() }
        }
        // Сбросим стек до корня и пушим
        path = [chatId]
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(LinearGradient.brand)
                    .frame(width: 46, height: 46)
                    .padding(2)
                Circle().fill(Color.darkSurface)
                    .frame(width: 42, height: 42)
                Avatar(url: auth.user?.avatar,
                       name: auth.user?.displayName ?? "?",
                       size: 38,
                       online: true)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(auth.user?.displayName ?? "—")
                    .font(Typo.bodyB)
                    .foregroundStyle(.white)
                Text("@\(auth.user?.username ?? "")")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.4))
            }
            Spacer()

            Button { showNewChat = true } label: {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(LinearGradient.brand)
                    .clipShape(Circle())
                    .shadow(color: Color.brandViolet.opacity(0.5), radius: 12, x: 0, y: 5)
            }
            .buttonStyle(PressDownStyle())

            Menu {
                Button(role: .destructive) { auth.logout() } label: {
                    Label("Выйти", systemImage: "rectangle.portrait.and.arrow.right")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(10)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.white.opacity(0.35))
            TextField("Поиск чатов…", text: $vm.search)
                .font(Typo.body)
                .foregroundStyle(.white)
                .tint(.brandViolet)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(Color.white.opacity(0.04))
        .overlay(Capsule().stroke(Color.white.opacity(0.07), lineWidth: 1))
        .clipShape(Capsule())
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if vm.loading && vm.chats.isEmpty {
            VStack(spacing: 8) {
                ProgressView().tint(.brandViolet)
                Text("Загрузка чатов…")
                    .font(Typo.small)
                    .foregroundStyle(.white.opacity(0.5))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = vm.error, vm.chats.isEmpty {
            errorView(error)
        } else if vm.filtered.isEmpty {
            emptyState
        } else {
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(vm.filtered) { chat in
                        NavigationLink(value: chat.id) {
                            ChatListRow(chat: chat, currentUserId: auth.user?.id)
                                .padding(.horizontal, 12)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .navigationDestination(for: String.self) { chatId in
                if let chat = vm.chats.first(where: { $0.id == chatId }),
                   let userId = auth.user?.id {
                    ChatView(chat: chat, currentUserId: userId, privateKey: auth.privateKey)
                        .environmentObject(auth)
                } else {
                    ChatPlaceholderView(chatId: chatId)
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(LinearGradient.brand)
                    .blur(radius: 16).opacity(0.35)
                    .frame(width: 60, height: 60)
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.white.opacity(0.05))
                    .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.white.opacity(0.08), lineWidth: 1))
                    .frame(width: 60, height: 60)
                Image(systemName: "person.2.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(.white.opacity(0.45))
            }
            Text("Здесь пока тихо")
                .font(Typo.bodyM)
                .foregroundStyle(.white.opacity(0.5))
            Text("Скоро добавим экран нового чата →")
                .font(.system(size: 12))
                .foregroundStyle(LinearGradient.brandText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 24))
                .foregroundStyle(Color(hex: 0xFCA5A5))
            Text(msg)
                .font(Typo.small)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
            Button("Повторить") { Task { await vm.load() } }
                .font(Typo.smallM)
                .foregroundStyle(LinearGradient.brandText)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Заглушка-плейсхолдер под детальный экран чата (будет реализован в след. сессии).
struct ChatPlaceholderView: View {
    let chatId: String
    var body: some View {
        ZStack {
            AmbientBackground()
            VStack(spacing: 8) {
                Image(systemName: "bubble.left.and.bubble.right")
                    .font(.system(size: 36))
                    .foregroundStyle(LinearGradient.brand)
                Text("Чат-экран в разработке")
                    .font(Typo.bodyB)
                    .foregroundStyle(.white)
                Text("chatId: \(chatId)")
                    .font(Typo.small)
                    .foregroundStyle(.white.opacity(0.4))
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    ChatListView().environmentObject(AuthStore())
}
