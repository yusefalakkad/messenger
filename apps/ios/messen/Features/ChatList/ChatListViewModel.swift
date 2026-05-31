import Foundation

@MainActor
final class ChatListViewModel: ObservableObject {
    @Published var chats: [Chat] = []
    @Published var loading: Bool = false
    @Published var error: String?
    @Published var search: String = ""

    var filtered: [Chat] {
        guard !search.isEmpty else { return chats }
        return chats.filter {
            let name = $0.name ?? ""
            let memberNames = $0.members.map { $0.user.displayName }.joined(separator: " ")
            return (name + memberNames).localizedCaseInsensitiveContains(search)
        }
    }

    func load() async {
        loading = true
        defer { loading = false }
        do {
            let result: [Chat] = try await APIClient.shared.get("chats")
            self.chats = result.sorted { lhs, rhs in
                (lhs.lastMessage?.createdAt ?? .distantPast) > (rhs.lastMessage?.createdAt ?? .distantPast)
            }
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
