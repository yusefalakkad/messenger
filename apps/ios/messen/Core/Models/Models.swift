import Foundation

// MARK: - User

struct User: Codable, Identifiable, Hashable {
    let id: String
    let username: String
    let displayName: String
    let avatar: String?
    let status: String?
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
