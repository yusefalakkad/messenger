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

    // MARK: - Group admin

    /// PATCH /chats/:id — переименование/смена аватара.
    @discardableResult
    static func renameGroup(chatId: String, name: String) async throws -> Chat {
        struct Body: Codable { let name: String }
        var url = AppConfig.apiBaseURL
        url.append(path: "chats/\(chatId)")
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        if let token = KeychainStore.get(KeychainStore.Keys.accessToken) {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(Body(name: name))
        let (data, _) = try await URLSession.shared.data(for: req)
        struct Env: Decodable { let data: Chat? }
        let env = try JSONDecoder.iso8601.decode(Env.self, from: data)
        if let chat = env.data { return chat }
        throw APIError.invalidResponse
    }

    /// POST /chats/:id/members
    static func addGroupMembers(chatId: String, userIds: [String]) async throws -> [ChatMember] {
        struct Body: Codable { let userIds: [String] }
        struct Resp: Codable { let added: [String]; let members: [ChatMember] }
        let r: Resp = try await APIClient.shared.post(
            "chats/\(chatId)/members",
            body: Body(userIds: userIds)
        )
        return r.members
    }

    /// DELETE /chats/:id/members/:userId — kick или leave (если userId === self)
    static func removeGroupMember(chatId: String, userId: String) async throws {
        var url = AppConfig.apiBaseURL
        url.append(path: "chats/\(chatId)/members/\(userId)")
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        if let token = KeychainStore.get(KeychainStore.Keys.accessToken) {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw URLError(.badServerResponse)
        }
    }
}

extension JSONDecoder {
    static var iso8601: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }
}
