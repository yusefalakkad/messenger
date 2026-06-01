package online.akkdmsg.dakka.data

import kotlinx.serialization.Serializable

/**
 * Базовые модели — синхронны с backend и iOS/web клиентами.
 */

@Serializable
data class User(
    val id: String,
    val username: String,
    val displayName: String,
    val avatar: String? = null,
    val status: String? = null,
    val publicKey: String? = null,
)

@Serializable
data class AuthTokens(
    val accessToken: String,
)

@Serializable
data class LoginRequest(
    val login: String,
    val password: String,
    val deviceId: String,
    val deviceName: String,
)

@Serializable
data class RegisterRequest(
    val username: String,
    val displayName: String,
    val password: String,
    val phone: String? = null,
    val publicKey: String? = null,
)

@Serializable
data class AuthResponse(
    val user: User,
    val tokens: AuthTokens,
    val twoFactorRequired: Boolean? = null,
    val twoFactorToken: String? = null,
)

/** Стандартный envelope бэка: { success, data, error }. */
@Serializable
data class ApiEnvelope<T>(
    val success: Boolean = true,
    val data: T? = null,
    val error: ApiError? = null,
)

@Serializable
data class ApiError(
    val code: String? = null,
    val message: String? = null,
)

// ─── Messages ────────────────────────────────────────────────────────────────

@Serializable
data class MessageSender(
    val id: String,
    val username: String? = null,
    val displayName: String,
    val avatar: String? = null,
    val publicKey: String? = null,
)

@Serializable
data class MediaInfo(
    val url: String,
    val mimeType: String? = null,
    val size: Long? = null,
    val duration: Double? = null,
    val width: Int? = null,
    val height: Int? = null,
    val waveform: List<Double>? = null,
    val thumbnailUrl: String? = null,
)

@Serializable
data class ReadReceipt(
    val userId: String,
    val readAt: String,  // ISO8601
)

@Serializable
data class Reaction(
    val userId: String,
    val emoji: String,
)

@Serializable
data class ReplyPreview(
    val id: String,
    val content: String? = null,
    val type: String? = null,
    val sender: MessageSender? = null,
)

@Serializable
data class Message(
    val id: String,
    val chatId: String,
    val senderId: String? = null,
    val sender: MessageSender? = null,
    val type: String,    // "text" | "voice" | "image" | "video" | "circle" | "file" | "system"
    val content: String? = null,
    val nonce: String? = null,
    val encrypted: Boolean? = null,
    val media: MediaInfo? = null,
    val replyToId: String? = null,
    val replyTo: ReplyPreview? = null,
    val forwardedFromId: String? = null,
    val editedAt: String? = null,
    val deletedAt: String? = null,
    val readBy: List<ReadReceipt>? = null,
    val reactions: List<Reaction>? = null,
    val createdAt: String,  // ISO8601
)

@Serializable
data class MediaPayload(
    val url: String,
    val mimeType: String? = null,
    val size: Long? = null,
    val duration: Double? = null,
    val width: Int? = null,
    val height: Int? = null,
    val waveform: List<Double>? = null,
    val thumbnailUrl: String? = null,
)

@Serializable
data class SendMessagePayload(
    val chatId: String,
    val type: String,
    val content: String? = null,
    val nonce: String? = null,
    val encrypted: Boolean? = null,
    val mediaData: MediaPayload? = null,
    val replyToId: String? = null,
    val forwardedFromId: String? = null,
)

// ─── Chats ───────────────────────────────────────────────────────────────────

@Serializable
data class ChatMember(
    val userId: String,
    val user: User,
    val role: String? = null,
    val mutedUntil: String? = null,
)

@Serializable
data class Chat(
    val id: String,
    val type: String,  // "direct" | "group"
    val name: String? = null,
    val avatar: String? = null,
    val members: List<ChatMember> = emptyList(),
    val lastMessage: Message? = null,
    val unreadCount: Int = 0,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)
