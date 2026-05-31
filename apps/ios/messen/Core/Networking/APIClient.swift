import Foundation

/// Тонкая обёртка над URLSession.
///
/// • async/await вместо callbacks
/// • Автоматически прикрепляет JWT-токен (читает из AuthStore)
/// • Разворачивает API-конверт `{ success, data, error }` в `T`
/// • Бросает `APIError` с человекочитаемым сообщением
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let baseURL: URL
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private init() {
        let cfg = URLSessionConfiguration.default
        cfg.waitsForConnectivity = true
        cfg.timeoutIntervalForRequest = 20
        self.session = URLSession(configuration: cfg)
        self.baseURL = AppConfig.apiBaseURL

        self.decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        decoder.keyDecodingStrategy = .useDefaultKeys

        self.encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
    }

    /// Токен берём прямо из Keychain — он thread-safe.
    /// Никаких callback'ов на main actor, никаких Sendable-проблем.
    private func currentToken() -> String? {
        KeychainStore.get(KeychainStore.Keys.accessToken)
    }

    // MARK: - Public methods

    func get<R: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> R {
        try await request(method: "GET", path: path, query: query, body: Optional<Empty>.none)
    }

    func post<B: Encodable, R: Decodable>(_ path: String, body: B) async throws -> R {
        try await request(method: "POST", path: path, query: [:], body: body)
    }

    func post<R: Decodable>(_ path: String) async throws -> R {
        try await request(method: "POST", path: path, query: [:], body: Optional<Empty>.none)
    }

    // MARK: - Core

    private func request<B: Encodable, R: Decodable>(
        method: String,
        path: String,
        query: [String: String],
        body: B?
    ) async throws -> R {
        var url = baseURL
        url.append(path: path.trimmingCharacters(in: ["/"]))

        if !query.isEmpty {
            var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
            comps?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
            if let resolved = comps?.url { url = resolved }
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        if let token = currentToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            req.httpBody = try encoder.encode(body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        // Парсим конверт
        let envelope: APIEnvelope<R>
        do {
            envelope = try decoder.decode(APIEnvelope<R>.self, from: data)
        } catch {
            // Если сервер вернул не наш формат — попробуем извлечь message хотя бы
            if !(200..<300).contains(http.statusCode) {
                let msg = (try? JSONSerialization.jsonObject(with: data)).flatMap {
                    (($0 as? [String: Any])?["error"] as? [String: Any])?["message"] as? String
                } ?? "HTTP \(http.statusCode)"
                throw APIError.server(code: nil, message: msg, status: http.statusCode)
            }
            throw APIError.decoding(error)
        }

        if let serverError = envelope.error {
            throw APIError.server(
                code: serverError.code,
                message: serverError.message ?? "Ошибка \(http.statusCode)",
                status: http.statusCode
            )
        }

        if envelope.success, let result = envelope.data {
            return result
        }

        // success=true но data=nil — допустим для R=Empty
        if let empty = Empty() as? R {
            return empty
        }

        throw APIError.invalidResponse
    }
}

/// Пустое тело — для POST без body / GET без query.
struct Empty: Codable {}
