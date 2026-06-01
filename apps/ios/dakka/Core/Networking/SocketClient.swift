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
    let chatUpdated      = PassthroughSubject<ChatUpdate, Never>()
    let chatRemoved      = PassthroughSubject<String, Never>()  // chatId
    let chatStateUpdated = PassthroughSubject<ChatStateUpdate, Never>()

    // Calls
    let callIncoming = PassthroughSubject<IncomingCallEvent, Never>()
    let callAccepted = PassthroughSubject<CallAcceptedEvent, Never>()
    let callEnded    = PassthroughSubject<CallEndedEvent, Never>()
    let callSignal   = PassthroughSubject<CallSignalEvent, Never>()

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

    func editMessage(messageId: String, chatId: String, content: String, nonce: String? = nil, encrypted: Bool = false) {
        var payload: [String: Any] = [
            "messageId": messageId,
            "chatId": chatId,
            "content": content,
            "encrypted": encrypted,
        ]
        if let n = nonce { payload["nonce"] = n }
        socket?.emit("message:edit", payload)
    }

    // MARK: - Call signaling

    func initiateCall(callId: String, peerId: String, chatId: String, callType: CallType) {
        socket?.emit("call:initiate", [
            "callId": callId,
            "peerId": peerId,
            "chatId": chatId,
            "callType": callType.rawValue,
        ])
    }

    func acceptCall(callId: String) {
        socket?.emit("call:accept", ["callId": callId])
    }

    func rejectCall(callId: String) {
        socket?.emit("call:reject", ["callId": callId])
    }

    func endCall(callId: String) {
        socket?.emit("call:end", ["callId": callId])
    }

    func sendCallSignal(callId: String, signal: CallSignal) {
        guard let data = try? JSONEncoder().encode(signal),
              let obj  = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }
        socket?.emit("call:signal", ["callId": callId, "signal": obj])
    }

    private func emit<E: Encodable>(_ event: String, _ payload: E) {
        // SendMessagePayload / другие наши Codable всегда сериализуются в dict,
        // явно кастуем чтобы Swift выбрал overload emit(_:with:completion:)
        // принимающий [SocketData] — [String: Any] под него подходит.
        guard let data = try? JSONEncoder().encode(payload),
              let dict = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any]
        else { return }
        socket?.emit(event, with: [dict], completion: nil)
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

        s.on("chat:updated") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let chatId = dict["chatId"] as? String else { return }
            self.chatUpdated.send(ChatUpdate(
                chatId: chatId,
                name: dict["name"] as? String,
                avatar: dict["avatar"] as? String,
                fields: dict
            ))
        }

        s.on("chat:removed") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let chatId = dict["chatId"] as? String else { return }
            self.chatRemoved.send(chatId)
        }

        s.on("chat:state-updated") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let chatId = dict["chatId"] as? String else { return }
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let isoBasic = ISO8601DateFormatter()
            // Двухступенчатый парсер: с .withFractionalSeconds и без
            func parseDate(_ key: String) -> Date? {
                guard let raw = dict[key] as? String else { return nil }
                return iso.date(from: raw) ?? isoBasic.date(from: raw)
            }
            let update = ChatStateUpdate(
                chatId: chatId,
                pinned: dict["pinned"] as? Bool,
                archived: dict["archived"] as? Bool,
                pinnedAt: parseDate("pinnedAt"),
                archivedAt: parseDate("archivedAt"),
                mutedUntil: parseDate("mutedUntil"),
                // Бэк может прислать `pinnedAt: null` / `archivedAt: null`, чтобы
                // явно снять флаг. Различаем «ключа нет» и «значение null».
                pinnedAtExplicitlyNull: dict.keys.contains("pinnedAt") && dict["pinnedAt"] is NSNull,
                archivedAtExplicitlyNull: dict.keys.contains("archivedAt") && dict["archivedAt"] is NSNull,
                mutedUntilExplicitlyNull: dict.keys.contains("mutedUntil") && dict["mutedUntil"] is NSNull
            )
            self.chatStateUpdated.send(update)
        }

        s.on("chat:member-left") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let chatId = dict["chatId"] as? String else { return }
            // Просто посылаем chat:updated — UI рефрешит
            self.chatUpdated.send(ChatUpdate(chatId: chatId, name: nil, avatar: nil, fields: dict))
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

        // ── Calls ──
        s.on("call:incoming") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let callId   = dict["callId"]   as? String,
                  let chatId   = dict["chatId"]   as? String,
                  let callerId = dict["callerId"] as? String,
                  let typeRaw  = dict["callType"] as? String,
                  let type     = CallType(rawValue: typeRaw) else { return }
            let event = IncomingCallEvent(
                callId: callId,
                chatId: chatId,
                callerId: callerId,
                callerName: (dict["callerName"] as? String) ?? "Звонок",
                callerAvatar: dict["callerAvatar"] as? String,
                callType: type
            )
            self.callIncoming.send(event)
        }

        s.on("call:accepted") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let callId = dict["callId"] as? String,
                  let peerId = dict["peerId"] as? String else { return }
            self.callAccepted.send(.init(callId: callId, peerId: peerId))
        }

        s.on("call:ended") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let callId = dict["callId"] as? String else { return }
            self.callEnded.send(.init(callId: callId, reason: dict["reason"] as? String))
        }

        s.on("call:signal") { [weak self] data, _ in
            guard let self,
                  let dict = data.first as? [String: Any],
                  let callId = dict["callId"] as? String,
                  let sigDict = dict["signal"] as? [String: Any] else { return }
            // Декодируем CallSignal через JSON-round-trip
            guard let raw = try? JSONSerialization.data(withJSONObject: sigDict),
                  let signal = try? JSONDecoder().decode(CallSignal.self, from: raw)
            else { return }
            self.callSignal.send(.init(callId: callId, signal: signal))
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

struct ChatUpdate {
    let chatId: String
    let name: String?
    let avatar: String?
    let fields: [String: Any]
}

/// Событие `chat:state-updated`.
///
/// Бэк присылает либо булевый флаг (`pinned: true`), либо точное время
/// (`pinnedAt: "2026-06-01T…"` / `null`). Здесь храним оба, плюс маркеры
/// «значение прислали как `null`» — чтобы UI мог честно снять флаг.
struct ChatStateUpdate {
    let chatId: String
    let pinned: Bool?
    let archived: Bool?
    let pinnedAt: Date?
    let archivedAt: Date?
    let mutedUntil: Date?
    let pinnedAtExplicitlyNull: Bool
    let archivedAtExplicitlyNull: Bool
    let mutedUntilExplicitlyNull: Bool
}

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
