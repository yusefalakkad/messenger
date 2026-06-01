import SwiftUI
import Combine

struct ChatListView: View {
    @EnvironmentObject var auth: AuthStore
    @StateObject private var vm = ChatListViewModel()

    @State private var path: [ChatListRoute] = []
    @State private var showNewChat = false
    @State private var showNewGroup = false
    @State private var showSettings = false
    @State private var muteSheetChatId: String?

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
        .modifier(SocketSubscriptions(vm: vm, path: $path, openChat: openChat))
        .confirmationDialog(
            "Заглушить уведомления",
            isPresented: Binding(
                get: { muteSheetChatId != nil },
                set: { if !$0 { muteSheetChatId = nil } }
            ),
            titleVisibility: .visible,
            presenting: muteSheetChatId
        ) { chatId in
            muteMenu(for: chatId)
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
        .sheet(isPresented: $showNewGroup) {
            NewGroupView(onGroupCreated: { chat in
                vm.upsert(chat)
                showNewGroup = false
                openChat(chat.id)
            })
            .environmentObject(auth)
            .presentationDetents([.large])
            .presentationBackground(.ultraThinMaterial)
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(auth)
                .presentationDetents([.large])
                .presentationBackground(.ultraThinMaterial)
        }
    }

    /// Группирует все push/socket-подписки в один модификатор —
    /// 13 модификаторов на корневом View упирались в compile-time лимит.
    private struct SocketSubscriptions: ViewModifier {
        @ObservedObject var vm: ChatListViewModel
        @Binding var path: [ChatListRoute]
        let openChat: (String) -> Void

        func body(content: Content) -> some View {
            content
                .onReceive(PushManager.shared.openChatRequested) { chatId in
                    openChat(chatId)
                }
                .onAppear {
                    if let pending = PushManager.shared.consumePendingChatId() {
                        openChat(pending)
                    }
                }
                .onReceive(SocketClient.shared.messageReceived) { _ in
                    Task { await vm.load() }
                }
                .onReceive(SocketClient.shared.chatCreated) { chat in
                    vm.upsert(chat)
                }
                .onReceive(SocketClient.shared.chatUpdated) { _ in
                    Task { await vm.load() }
                }
                .onReceive(SocketClient.shared.chatRemoved) { chatId in
                    vm.chats.removeAll { $0.id == chatId }
                    if case .chat(let id) = path.last, id == chatId { path.removeLast() }
                }
                .onReceive(SocketClient.shared.chatStateUpdated) { update in
                    vm.applyStateUpdate(update)
                }
        }
    }

    private func openChat(_ chatId: String) {
        // Если чата ещё нет в списке — подгрузим
        if !vm.chats.contains(where: { $0.id == chatId }) {
            Task { await vm.load() }
        }
        // Сбросим стек до корня и пушим
        path = [.chat(chatId)]
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

            Menu {
                Button { showNewChat = true } label: {
                    Label("Новый чат", systemImage: "bubble.left.fill")
                }
                Button { showNewGroup = true } label: {
                    Label("Новая группа", systemImage: "person.2.fill")
                }
            } label: {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(LinearGradient.brand)
                    .clipShape(Circle())
                    .shadow(color: Color.brandViolet.opacity(0.5), radius: 12, x: 0, y: 5)
            }

            Button { showSettings = true } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.75))
                    .frame(width: 38, height: 38)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())
            }
            .buttonStyle(PressDownStyle())
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
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(0..<6, id: \.self) { _ in
                        ChatRowSkeleton().padding(.horizontal, 12)
                    }
                }
                .padding(.top, 4)
            }
        } else if let error = vm.error, vm.chats.isEmpty {
            errorView(error)
        } else if vm.filtered.isEmpty && vm.archivedChats.isEmpty {
            emptyState
        } else {
            chatList
                .navigationDestination(for: ChatListRoute.self) { route in
                    switch route {
                    case .chat(let chatId):
                        if let chat = vm.chats.first(where: { $0.id == chatId }),
                           let userId = auth.user?.id {
                            ChatView(chat: chat, currentUserId: userId, privateKey: auth.privateKey)
                                .environmentObject(auth)
                        } else {
                            ChatPlaceholderView(chatId: chatId)
                        }
                    case .archive:
                        ArchivedChatsView(vm: vm)
                            .environmentObject(auth)
                    }
                }
        }
    }

    /// Список чатов на основе `List` — это даёт нативный `.swipeActions`.
    /// Тёмная подложка из `AmbientBackground` остаётся, фоны строк — clear.
    private var chatList: some View {
        List {
            // Шапка «Архив (N)» — если есть архивные чаты и нет активного поиска
            if !vm.archivedChats.isEmpty && vm.search.isEmpty {
                NavigationLink(value: ChatListRoute.archive) {
                    archiveEntryRow
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
            }

            ForEach(vm.filtered) { chat in
                NavigationLink(value: ChatListRoute.chat(chat.id)) {
                    ChatListRow(chat: chat, currentUserId: auth.user?.id)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 2, leading: 12, bottom: 2, trailing: 12))
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    Button {
                        togglePin(chat)
                    } label: {
                        Label(
                            chat.isPinned ? "Открепить" : "Закрепить",
                            systemImage: chat.isPinned ? "pin.slash.fill" : "pin.fill"
                        )
                    }
                    .tint(.brandViolet)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button {
                        toggleArchive(chat)
                    } label: {
                        Label("Архив", systemImage: "archivebox.fill")
                    }
                    .tint(.brandOrange)

                    Button {
                        muteSheetChatId = chat.id
                    } label: {
                        Label("Звук", systemImage: chat.isMuted(currentUserId: auth.user?.id)
                              ? "bell.slash.fill" : "bell.fill")
                    }
                    .tint(.gray)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: vm.filtered.map(\.id))
    }

    private var archiveEntryRow: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.brandOrange.opacity(0.15))
                    .frame(width: 44, height: 44)
                Image(systemName: "archivebox.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color.brandOrange)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Архив")
                    .font(Typo.bodyB)
                    .foregroundStyle(.white)
                Text("\(vm.archivedChats.count) " + archiveCountWord(vm.archivedChats.count))
                    .font(Typo.small)
                    .foregroundStyle(.white.opacity(0.5))
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.3))
        }
        .padding(.vertical, 6)
        .padding(.trailing, 4)
        .contentShape(Rectangle())
    }

    private func archiveCountWord(_ n: Int) -> String {
        let mod100 = n % 100
        if (11...14).contains(mod100) { return "чатов" }
        switch n % 10 {
        case 1:      return "чат"
        case 2...4:  return "чата"
        default:     return "чатов"
        }
    }

    // MARK: - Mute sheet

    @ViewBuilder
    private func muteMenu(for chatId: String) -> some View {
        let isMuted = vm.chats.first(where: { $0.id == chatId })?
            .isMuted(currentUserId: auth.user?.id) ?? false

        Button("1 час")        { applyMute(chatId, hours: 1) }
        Button("8 часов")      { applyMute(chatId, hours: 8) }
        Button("До завтра")    { applyMuteUntilTomorrow(chatId) }
        Button("Навсегда")     { applyMuteForever(chatId) }
        if isMuted {
            Button("Включить", role: .destructive) { applyUnmute(chatId) }
        }
        Button("Отмена", role: .cancel) { }
    }

    // MARK: - Actions

    private func togglePin(_ chat: Chat) {
        let pin = !chat.isPinned
        // Оптимистично патчим UI
        vm.patchLocally(chatId: chat.id, pinnedAt: .set(pin ? Date() : nil))
        Task {
            do {
                _ = try await ChatService.pin(chatId: chat.id, pinned: pin)
                Toast.success(pin ? "Закреплён" : "Откреплён", duration: 1.5)
            } catch {
                // Откатываем
                vm.patchLocally(chatId: chat.id, pinnedAt: .set(chat.pinnedAt))
                if let api = error as? APIError,
                   case .server(let code, _, _) = api,
                   code == "PIN_LIMIT_REACHED" {
                    Toast.error("Лимит закреплённых",
                                message: "Можно закрепить не более 5 чатов")
                } else {
                    Toast.error("Не удалось закрепить",
                                message: (error as? APIError)?.errorDescription)
                }
            }
        }
    }

    private func toggleArchive(_ chat: Chat) {
        let archive = !chat.isArchived
        vm.patchLocally(chatId: chat.id, archivedAt: .set(archive ? Date() : nil))
        Task {
            do {
                _ = try await ChatService.archive(chatId: chat.id, archived: archive)
                Toast.success(archive ? "В архиве" : "Из архива", duration: 1.5)
            } catch {
                vm.patchLocally(chatId: chat.id, archivedAt: .set(chat.archivedAt))
                Toast.error("Не удалось",
                            message: (error as? APIError)?.errorDescription)
            }
        }
    }

    private func applyMute(_ chatId: String, hours: Int) {
        let date = Date(timeIntervalSinceNow: Double(hours) * 3600)
        sendMute(chatId, until: ISO8601DateFormatter().string(from: date), local: date)
    }

    private func applyMuteUntilTomorrow(_ chatId: String) {
        let cal = Calendar.current
        var comps = cal.dateComponents([.year, .month, .day], from: Date())
        comps.day = (comps.day ?? 0) + 1
        comps.hour = 9
        let date = cal.date(from: comps) ?? Date(timeIntervalSinceNow: 86_400)
        sendMute(chatId, until: ISO8601DateFormatter().string(from: date), local: date)
    }

    private func applyMuteForever(_ chatId: String) {
        // Локально показываем «очень далёкая дата» чтобы isMuted == true
        let far = Date(timeIntervalSinceNow: 60 * 60 * 24 * 365 * 100)
        sendMute(chatId, until: "forever", local: far)
    }

    private func applyUnmute(_ chatId: String) {
        sendMute(chatId, until: nil, local: nil)
    }

    private func sendMute(_ chatId: String, until: String?, local: Date?) {
        let previous = vm.chats.first(where: { $0.id == chatId })?.mutedUntil
        vm.patchLocally(chatId: chatId, mutedUntil: .set(local))
        Task {
            do {
                _ = try await ChatService.mute(chatId: chatId, until: until)
                if until == nil {
                    Toast.success("Уведомления включены", duration: 1.5)
                } else {
                    Toast.success("Уведомления заглушены", duration: 1.5)
                }
            } catch {
                vm.patchLocally(chatId: chatId, mutedUntil: .set(previous))
                Toast.error("Не удалось",
                            message: (error as? APIError)?.errorDescription)
            }
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        if !vm.search.isEmpty {
            EmptyState(
                iconName: "magnifyingglass",
                title: "Ничего не нашлось",
                subtitle: "Попробуй другой запрос"
            )
        } else {
            EmptyState(
                iconName: "bubble.left.and.bubble.right.fill",
                title: "Здесь пока тихо",
                subtitle: "Начни первый чат — нажми ✏ в шапке"
            ) {
                Button {
                    showNewChat = true
                } label: {
                    Text("Создать чат →")
                        .font(Typo.smallM)
                        .foregroundStyle(LinearGradient.brandText)
                        .padding(.top, 4)
                }
            }
        }
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

/// Маршруты для NavigationStack в ChatListView.
enum ChatListRoute: Hashable {
    case chat(String)
    case archive
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
