import SwiftUI

/// Список архивных чатов. Использует тот же ChatListViewModel,
/// чтобы изменения (разархивация) сразу отражались и здесь, и в основном списке.
///
/// Из действий в свайпе — только «Разархивировать», по требованию задачи.
struct ArchivedChatsView: View {
    @EnvironmentObject var auth: AuthStore
    @ObservedObject var vm: ChatListViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            AmbientBackground()

            VStack(spacing: 0) {
                if vm.archivedChats.isEmpty {
                    EmptyState(
                        iconName: "archivebox",
                        title: "В архиве пусто",
                        subtitle: "Свайпни чат влево → «Архив», чтобы спрятать его сюда"
                    )
                } else {
                    list
                }
            }
        }
        .navigationTitle("Архив")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
    }

    private var list: some View {
        List {
            ForEach(vm.archivedChats) { chat in
                NavigationLink(value: ChatListRoute.chat(chat.id)) {
                    ChatListRow(chat: chat, currentUserId: auth.user?.id)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 2, leading: 12, bottom: 2, trailing: 12))
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button {
                        unarchive(chat)
                    } label: {
                        Label("Разархивировать", systemImage: "tray.and.arrow.up.fill")
                    }
                    .tint(.brandOrange)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: vm.archivedChats.map(\.id))
    }

    private func unarchive(_ chat: Chat) {
        let previous = chat.archivedAt
        vm.patchLocally(chatId: chat.id, archivedAt: .set(nil))
        Task {
            do {
                _ = try await ChatService.archive(chatId: chat.id, archived: false)
                Toast.success("Из архива", duration: 1.5)
            } catch {
                vm.patchLocally(chatId: chat.id, archivedAt: .set(previous))
                Toast.error("Не удалось",
                            message: (error as? APIError)?.errorDescription)
            }
        }
    }
}
