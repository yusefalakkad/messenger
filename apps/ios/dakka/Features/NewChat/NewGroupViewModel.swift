import Foundation
import Combine

@MainActor
final class NewGroupViewModel: ObservableObject {
    @Published var name: String = ""
    @Published var query: String = ""
    @Published var results: [User] = []
    @Published var selected: [User] = []
    @Published var loading: Bool = false
    @Published var creating: Bool = false
    @Published var error: String?

    var canCreate: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !selected.isEmpty && !creating
    }

    private var cancellables = Set<AnyCancellable>()

    init() {
        $query
            .debounce(for: .milliseconds(250), scheduler: DispatchQueue.main)
            .removeDuplicates()
            .sink { [weak self] q in
                Task { await self?.search(q) }
            }
            .store(in: &cancellables)
    }

    func toggle(_ user: User) {
        if let idx = selected.firstIndex(where: { $0.id == user.id }) {
            selected.remove(at: idx)
        } else {
            selected.append(user)
        }
    }

    func isSelected(_ user: User) -> Bool {
        selected.contains(where: { $0.id == user.id })
    }

    func search(_ q: String) async {
        let trimmed = q.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 1 else { results = []; return }
        loading = true; defer { loading = false }
        do {
            let users: [User] = try await APIClient.shared.get("users/search", query: ["q": trimmed])
            // Не показываем уже выбранных в результатах поиска
            self.results = users.filter { u in !selected.contains(where: { $0.id == u.id }) }
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Создаёт группу. Возвращает Chat или nil.
    func create() async -> Chat? {
        guard canCreate else { return nil }
        creating = true; defer { creating = false }
        struct Body: Codable {
            let name: String
            let memberIds: [String]
        }
        do {
            let chat: Chat = try await APIClient.shared.post(
                "chats/group",
                body: Body(
                    name: name.trimmingCharacters(in: .whitespaces),
                    memberIds: selected.map { $0.id }
                )
            )
            return chat
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }
}
