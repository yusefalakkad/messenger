package online.akkdmsg.dakka.data.api

import kotlinx.serialization.Serializable
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.Message

object ChatApi {

    suspend fun listChats(): List<Chat> =
        ApiClient.get("chats")

    suspend fun listMessages(chatId: String): List<Message> =
        ApiClient.get("chats/$chatId/messages")

    @Serializable
    private data class DirectRequest(val targetUserId: String)

    suspend fun createDirect(targetUserId: String): Chat =
        ApiClient.post("chats/direct", DirectRequest(targetUserId))
}
