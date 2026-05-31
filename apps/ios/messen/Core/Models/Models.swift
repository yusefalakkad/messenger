import Foundation

// MARK: - User

struct User: Codable, Identifiable, Hashable {
    let id: String
    let username: String
    let displayName: String
    let avatar: String?
    let status: String?
    /// X25519/P-256 public key (base64 SPKI). Используется для E2E к этому юзеру.
    let publicKey: String?
}

// MARK: - Chat

enum ChatType: String, Codable {
    case direct
    case group
}

struct ChatMember: Codable, Hashable {
    let userId: String
    let user: User
    let role: String?
}

struct LastMessage: Codable, Hashable {
    let id: String
    let chatId: String
    let senderId: String?
    let content: String?
    let type: String
    let createdAt: Date
}

// MARK: - Message

enum MessageType: String, Codable {
    case text
    case voice
    case image
    case video
    case circle
    case file
    case system
}

struct ReadReceipt: Codable, Hashable {
    let userId: String
    let readAt: Date
}

struct Reaction: Codable, Hashable {
    let userId: String
    let emoji: String
}

struct MessageSender: Codable, Hashable {
    let id: String
    let username: String?
    let displayName: String
    let avatar: String?
    let publicKey: String?
}

struct MediaInfo: Codable, Hashable {
    let url: String
    let mimeType: String?
    let size: Int?
    let duration: Double?     // секунды (voice/circle/video)
    let width: Int?
    let height: Int?
    let waveform: [Double]?   // голосовое
    let thumbnailUrl: String?
}

/// Снапшот сообщения, на которое ответили (приходит вложенным).
struct ReplyPreview: Codable, Hashable {
    let id: String
    let content: String?
    let type: String?
    let sender: MessageSender?
}

struct Message: Codable, Identifiable, Hashable {
    let id: String
    let chatId: String
    let senderId: String?
    let sender: MessageSender?
    let type: MessageType
    let content: String?        // если encrypted — это ciphertext base64
    let nonce: String?          // base64 nonce для AES-GCM
    let encrypted: Bool?
    let media: MediaInfo?
    let replyToId: String?
    let replyTo: ReplyPreview?
    let forwardedFromId: String?
    let editedAt: Date?
    let deletedAt: Date?
    let readBy: [ReadReceipt]?
    let reactions: [Reaction]?
    let createdAt: Date
}

struct MediaPayload: Codable {
    let url: String
    let mimeType: String?
    let size: Int?
    let duration: Double?
    let width: Int?
    let height: Int?
    let waveform: [Double]?
    let thumbnailUrl: String?
}

/// DTO для отправки сообщения через socket.io событие `message:send`.
struct SendMessagePayload: Codable {
    let chatId: String
    let type: String
    let content: String?
    let nonce: String?
    let encrypted: Bool?
    let mediaData: MediaPayload?
    let replyToId: String?
    let forwardedFromId: String?
}

struct Chat: Codable, Identifiable, Hashable {
    let id: String
    let type: ChatType
    let name: String?
    let avatar: String?
    let members: [ChatMember]
    let lastMessage: LastMessage?
    let unreadCount: Int?

    /// Имя для отображения: имя группы или имя другого участника в direct-чате.
    func displayName(currentUserId: String?) -> String {
        if type == .group { return name ?? "Группа" }
        return members.first(where: { $0.userId != currentUserId })?.user.displayName ?? "?"
    }

    func displayAvatar(currentUserId: String?) -> String? {
        if type == .group { return avatar }
        return members.first(where: { $0.userId != currentUserId })?.user.avatar
    }

    func isOnline(currentUserId: String?) -> Bool {
        guard type == .direct,
              let other = members.first(where: { $0.userId != currentUserId })
        else { return false }
        return other.user.status == "online"
    }
}

// MARK: - Auth

struct AuthTokens: Codable {
    let accessToken: String
}

struct LoginResponse: Codable {
    let user: User?
    let tokens: AuthTokens?
    let twoFactorRequired: Bool?
    let twoFactorToken: String?
}

struct RegisterResponse: Codable {
    let user: User
    let tokens: AuthTokens
}

// MARK: - API Envelope

/// Стандартный конверт ответа бэка: `{ success, data, error }`.
/// Generic-параметр требует только Decodable — мы никогда не отправляем envelope,
/// только парсим в ответе.
struct APIEnvelope<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let error: APIErrorPayload?
}

struct APIErrorPayload: Codable {
    let code: String?
    let message: String?
}
