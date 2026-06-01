import Foundation

/// REST-операции над чатом, для которых нет socket-эквивалентов:
/// pin / archive / mute (новый формат) / listArchived.
///
/// Эндпоинты PATCH /chats/:id/{pin,archive,mute} и GET /chats/archived
/// добавлены в бэкенд параллельно с этим UI-слоем.
enum ChatService {

    // MARK: - PATCH /chats/:chatId/pin

    @discardableResult
    static func pin(chatId: String, pinned: Bool) async throws -> Date? {
        struct Body: Encodable { let pinned: Bool }
        struct Resp: Decodable { let pinnedAt: Date? }
        let r: Resp = try await patch("chats/\(chatId)/pin", body: Body(pinned: pinned))
        return r.pinnedAt
    }

    // MARK: - PATCH /chats/:chatId/archive

    @discardableResult
    static func archive(chatId: String, archived: Bool) async throws -> Date? {
        struct Body: Encodable { let archived: Bool }
        struct Resp: Decodable { let archivedAt: Date? }
        let r: Resp = try await patch("chats/\(chatId)/archive", body: Body(archived: archived))
        return r.archivedAt
    }

    // MARK: - PATCH /chats/:chatId/mute

    /// `until` принимает:
    ///   • `nil`         — снять mute
    ///   • `"forever"`   — заглушить навсегда
    ///   • ISO-8601 дата — заглушить до конкретного момента
    @discardableResult
    static func mute(chatId: String, until: String?) async throws -> Date? {
        struct Body: Encodable { let until: String? }
        struct Resp: Decodable { let mutedUntil: Date? }
        let r: Resp = try await patch("chats/\(chatId)/mute", body: Body(until: until))
        return r.mutedUntil
    }

    // MARK: - GET /chats/archived

    static func listArchived() async throws -> [Chat] {
        try await APIClient.shared.get("chats/archived")
    }

    // MARK: - PATCH helper

    /// APIClient не умеет PATCH из коробки — гоним через URLSession напрямую
    /// (тем же путём, что и ChatActions.renameGroup), но с разбором конверта
    /// и нормальной ошибкой.
    private static func patch<B: Encodable, R: Decodable>(
        _ path: String,
        body: B
    ) async throws -> R {
        var url = AppConfig.apiBaseURL
        url.append(path: path.trimmingCharacters(in: ["/"]))

        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = KeychainStore.get(KeychainStore.Keys.accessToken) {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        req.httpBody = try encoder.encode(body)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        // Пытаемся распарсить конверт
        if let envelope = try? decoder.decode(APIEnvelope<R>.self, from: data) {
            if let err = envelope.error {
                throw APIError.server(
                    code: err.code,
                    message: err.message ?? "Ошибка \(http.statusCode)",
                    status: http.statusCode
                )
            }
            if envelope.success, let result = envelope.data {
                return result
            }
            if let empty = Empty() as? R { return empty }
        }

        if !(200..<300).contains(http.statusCode) {
            // Пробуем достать message напрямую из произвольного JSON
            let msg = (try? JSONSerialization.jsonObject(with: data)).flatMap {
                (($0 as? [String: Any])?["error"] as? [String: Any])?["message"] as? String
            } ?? "HTTP \(http.statusCode)"
            let code = (try? JSONSerialization.jsonObject(with: data)).flatMap {
                (($0 as? [String: Any])?["error"] as? [String: Any])?["code"] as? String
            }
            throw APIError.server(code: code, message: msg, status: http.statusCode)
        }

        throw APIError.invalidResponse
    }
}
