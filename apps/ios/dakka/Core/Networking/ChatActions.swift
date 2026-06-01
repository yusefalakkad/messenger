import Foundation

/// Тонкий слой над REST для действий над чатом, не идущих через сокет:
/// mute / clear history / search messages.
enum ChatActions {

    // MARK: - Mute

    @discardableResult
    static func setMute(chatId: String, mutedUntil: Date?) async throws -> Date? {
        struct Body: Codable { let mutedUntil: String? }
        struct Resp: Codable { let mutedUntil: Date? }
        let isoString = mutedUntil.map { ISO8601DateFormatter().string(from: $0) }
        let r: Resp = try await APIClient.shared.post(
            "chats/\(chatId)/mute",
            body: Body(mutedUntil: isoString)
        )
        return r.mutedUntil
    }

    // MARK: - Clear history

    @discardableResult
    static func clearMessages(chatId: String) async throws -> Bool {
        struct Resp: Codable { let cleared: Bool }
        var url = AppConfig.apiBaseURL
        url.append(path: "chats/\(chatId)/messages")
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        if let token = KeychainStore.get(KeychainStore.Keys.accessToken) {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw URLError(.badServerResponse)
        }
        struct Env: Decodable { let success: Bool; let data: Resp? }
        let env = try JSONDecoder().decode(Env.self, from: data)
        return env.data?.cleared == true
    }

    // MARK: - Search

    static func search(chatId: String, query: String) async throws -> [Message] {
        try await APIClient.shared.get("chats/\(chatId)/messages/search", query: ["q": query])
    }
}
