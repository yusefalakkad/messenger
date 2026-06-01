import Foundation

@MainActor
final class ChatListViewModel: ObservableObject {
    @Published var chats: [Chat] = []
    @Published var loading: Bool = false
    @Published var error: String?
    @Published var search: String = ""

    /// Чаты для основного списка — без архивных.
    var visibleChats: [Chat] {
        chats.filter { !$0.isArchived }
    }

    /// Архивные — для счётчика и для отдельного экрана.
    var archivedChats: [Chat] {
        chats.filter { $0.isArchived }
    }

    /// Отфильтрованный список для UI (с учётом search и без архивных).
    var filtered: [Chat] {
        let base = visibleChats
        guard !search.isEmpty else { return base }
        return base.filter {
            let name = $0.name ?? ""
            let memberNames = $0.members.map { $0.user.displayName }.joined(separator: " ")
            return (name + memberNames).localizedCaseInsensitiveContains(search)
        }
    }

    /// Добавляет чат, если его нет, или заменяет существующий по id (+пересортировка).
    func upsert(_ chat: Chat) {
        if let idx = chats.firstIndex(where: { $0.id == chat.id }) {
            chats[idx] = chat
        } else {
            chats.insert(chat, at: 0)
        }
        sort()
    }

    /// Применяет socket-событие `chat:state-updated` к локальному списку.
    /// Если ключ explicitly null — снимаем флаг; если nil — оставляем как было.
    func applyStateUpdate(_ u: ChatStateUpdate) {
        guard let idx = chats.firstIndex(where: { $0.id == u.chatId }) else { return }
        let old = chats[idx]

        let pinned: ChatStateField<Date>
        if u.pinnedAtExplicitlyNull { pinned = .set(nil) }
        else if let v = u.pinnedAt   { pinned = .set(v) }
        else if u.pinned == false    { pinned = .set(nil) }
        else if u.pinned == true     { pinned = .set(old.pinnedAt ?? Date()) }
        else                          { pinned = .keep }

        let archived: ChatStateField<Date>
        if u.archivedAtExplicitlyNull { archived = .set(nil) }
        else if let v = u.archivedAt  { archived = .set(v) }
        else if u.archived == false   { archived = .set(nil) }
        else if u.archived == true    { archived = .set(old.archivedAt ?? Date()) }
        else                           { archived = .keep }

        let muted: ChatStateField<Date>
        if u.mutedUntilExplicitlyNull { muted = .set(nil) }
        else if let v = u.mutedUntil  { muted = .set(v) }
        else                           { muted = .keep }

        chats[idx] = old.withState(
            pinnedAt: pinned,
            archivedAt: archived,
            mutedUntil: muted
        )
        sort()
    }

    /// Локально патчит чат — для оптимистичного апдейта до ответа сервера.
    func patchLocally(chatId: String,
                      pinnedAt: ChatStateField<Date> = .keep,
                      archivedAt: ChatStateField<Date> = .keep,
                      mutedUntil: ChatStateField<Date> = .keep) {
        guard let idx = chats.firstIndex(where: { $0.id == chatId }) else { return }
        chats[idx] = chats[idx].withState(
            pinnedAt: pinnedAt,
            archivedAt: archivedAt,
            mutedUntil: mutedUntil
        )
        sort()
    }

    /// Сортировка: сначала закреплённые (по pinnedAt desc), потом по
    /// времени последнего сообщения. Архивные исключены из видимого списка,
    /// но в коллекции остаются — сортируем целиком, не теряя их позицию.
    private func sort() {
        chats.sort { lhs, rhs in
            // Закреплённые всегда выше незакреплённых.
            switch (lhs.isPinned, rhs.isPinned) {
            case (true, false): return true
            case (false, true): return false
            case (true, true):
                let l = lhs.pinnedAt ?? .distantPast
                let r = rhs.pinnedAt ?? .distantPast
                return l > r
            case (false, false):
                let l = lhs.lastMessage?.createdAt ?? .distantPast
                let r = rhs.lastMessage?.createdAt ?? .distantPast
                return l > r
            }
        }
    }

    func load() async {
        loading = true
        defer { loading = false }
        do {
            // includeArchived=1 — бэк вернёт и архивные, чтобы посчитать бейдж
            // «📦 Архив (N)» в шапке списка.
            let result: [Chat] = try await APIClient.shared.get(
                "chats",
                query: ["includeArchived": "1"]
            )
            self.chats = result
            sort()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
