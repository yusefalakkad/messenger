import Foundation
import Combine
import SocketIO

/// Real-time клиент к бэкенду. Тонкая обёртка над SocketIO Swift,
/// прокидывает события в Combine publishers — Views подписываются.
@MainActor
final class SocketClient: ObservableObject {
    static let shared = SocketClient()

    // MARK: - State

    @Published private(set) var connected: Bool = false

    // MARK: - Event publishers

    let messageReceived  = PassthroughSubject<Message, Never>()
    let messageUpdated   = PassthroughSubject<MessageUpdate, Never>()
    let messageDeleted   = PassthroughSubject<MessageDeleted, Never>()
    let messageRead      = PassthroughSubject<MessageRead, Never>()
    let typingChanged    = PassthroughSubject<TypingEvent, Never>()
    let userStatus       = PassthroughSubject<UserStatusEvent, Never>()
    let chatCreated      = PassthroughSubject<Chat, Never>()

    // MARK: - Internals

    private var manager: SocketManager?
    private var socket: SocketIOClient?

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private init() {}

    // MARK: - Lifecycle

    /// Подключиться. Идемпотентно — повторный вызов с тем же токеном переподключает.
    func connect() {
        guard let token = KeychainStore.get(KeychainStore.Keys.accessToken) else {
            return
        }

        // Если уже подключены — не дёргаем
        if socket?.status == .connected, manager?.handleQueue == .main { return }

        disconnect()

        let m = SocketManager(socketURL: AppConfig.socketBaseURL, config: [
            .log(false),
            .compress,
            .reconnects(true),
            .reconnectAttempts(-1),
            .reconnectWait(1),
            .forceWebsockets(true),
            .connectParams(["token": token]),
            .extraHeaders(["Authorization": "Bearer \(token)"]),
        ])
        m.handleQueue = .main
        self.manager = m

        let s = m.defaultSocket
        self.socket = s

        wireHandlers(s)
        s.connect()
    }

    func disconnect() {
        socket?.removeAllHandlers()
        socket?.disconnect()
        socket = nil
        manager = nil
        connected = false
    }

    // MARK: - Emitters

    func send(_ payload: SendMessagePayload) {
        emit("message:send", payload)
    }

    func setTyping(chatId: String, isTyping: Bool) {
        socket?.emit("message:typing", ["chatId": chatId, "isTyping": isTyping])
    }

    func markRead(messageId: String, chatId: String) {
        socket?.emit("message:read", ["messageId": messageId, "chatId": chatId])
    }

    func reactToMessage(messageId: String, chatId: String, emoji: String) {
        socket?.emit("message:react", ["messageId": messageId, "chatId": chatId, "emoji": emoji])
    }

    func deleteMessageRemote(messageId: String, chatId: String) {
        socket?.emit("message:delete", ["messageId": messageId, "chatId": chatId])
    }

    private func emit<E: Encodable>(_ event: String, _ payload: E) {
        guard let data = try? JSONEncoder().encode(payload),
              let obj  = try? JSONSerialization.jsonObject(with: data, options: [])
        else { return }
        socket?.emit(event, with: [obj], completion: nil)
    }

    // MARK: - Wiring

    private func wireHandlers(_ s: SocketIOClient) {
        s.on(clientEvent: .connect) { [weak self] _, _ in
            self?.connected = true
        }
        s.on(clientEvent: .disconnect) { [weak self] _, _ in
            self?.connected = false
        }
        s.on(clientEvent: .error) { _, data in
            print("[Socket] error:", data)
        }

        s.on("chat:new") { [weak self] data, _ in
            guard let self,
                  let dict = data.first,
                  let chat: Chat = self.decode(dict) else { return }
            self.chatCreated.send(chat)
        }

        s.on("message:new") { [weak self] data, _ in
            guard let self,
                  let dict = data.first,
                  let msg: Message = self.decode(dict) else { return }
            self.messageReceived.send(msg)
        }

        s.on("message:updated") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let id = dict["id"] as? String else { return }
            self.messageUpdated.send(MessageUpdate(id: id, fields: dict))
        }

        s.on("message:deleted") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let messageId = dict["messageId"] as? String,
                  let chatId    = dict["chatId"] as? String else { return }
            self.messageDeleted.send(.init(messageId: messageId, chatId: chatId))
        }

        s.on("message:read") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let messageId = dict["messageId"] as? String,
                  let chatId    = dict["chatId"]    as? String,
                  let userId    = dict["userId"]    as? String else { return }
            let readAt = (dict["readAt"] as? String).flatMap { ISO8601DateFormatter().date(from: $0) } ?? Date()
            self.messageRead.send(.init(messageId: messageId, chatId: chatId, userId: userId, readAt: readAt))
        }

        s.on("user:typing") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let chatId  = dict["chatId"]  as? String,
                  let userId  = dict["userId"]  as? String,
                  let typing  = dict["isTyping"] as? Bool else { return }
            self.typingChanged.send(.init(chatId: chatId, userId: userId, isTyping: typing))
        }

        s.on("user:status") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let userId = dict["userId"] as? String,
                  let status = dict["status"] as? String else { return }
            self.userStatus.send(.init(userId: userId, status: status))
        }
    }

    /// Decoder для произвольного JSON-объекта (socket.io отдаёт `[Any]`).
    private func decode<T: Decodable>(_ raw: Any) -> T? {
        guard let data = try? JSONSerialization.data(withJSONObject: raw)
        else { return nil }
        return try? decoder.decode(T.self, from: data)
    }
}

// MARK: - Event payloads

struct MessageUpdate {
    let id: String
    let fields: [String: Any]
}

struct MessageDeleted {
    let messageId: String
    let chatId: String
}

struct MessageRead {
    let messageId: String
    let chatId: String
    let userId: String
    let readAt: Date
}

struct TypingEvent {
    let chatId: String
    let userId: String
    let isTyping: Bool
}

struct UserStatusEvent {
    let userId: String
    let status: String
}
