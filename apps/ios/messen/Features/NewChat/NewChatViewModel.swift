import Foundation
import Combine

@MainActor
final class NewChatViewModel: ObservableObject {
    @Published var query: String = ""
    @Published var results: [User] = []
    @Published var loading: Bool = false
    @Published var error: String?
    @Published var creatingChatForUserId: String?

    private var cancellables = Set<AnyCancellable>()

    init() {
        // Debounced search
        $query
            .debounce(for: .milliseconds(250), scheduler: DispatchQueue.main)
            .removeDuplicates()
            .sink { [weak self] q in
                Task { await self?.search(q) }
            }
            .store(in: &cancellables)
    }

    func search(_ q: String) async {
        let trimmed = q.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 1 else {
            results = []
            return
        }
        loading = true
        defer { loading = false }
        do {
            let users: [User] = try await APIClient.shared.get("users/search", query: ["q": trimmed])
            self.results = users
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Создаёт direct-чат с указанным пользователем. Возвращает созданный Chat.
    func createDirectChat(with userId: String) async -> Chat? {
        creatingChatForUserId = userId
        defer { creatingChatForUserId = nil }
        do {
            struct Body: Codable { let targetUserId: String }
            let chat: Chat = try await APIClient.shared.post("chats/direct", body: Body(targetUserId: userId))
            return chat
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }
}
