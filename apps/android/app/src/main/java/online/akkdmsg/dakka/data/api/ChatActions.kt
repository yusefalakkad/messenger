package online.akkdmsg.dakka.data.api

import kotlinx.serialization.Serializable
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import online.akkdmsg.dakka.data.ApiEnvelope
import online.akkdmsg.dakka.data.AppConfig
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.ChatMember
import online.akkdmsg.dakka.data.Message
import java.util.concurrent.TimeUnit

/** Действия над чатами не через сокет: создание, mute, clear, search, group admin. */
object ChatActions {

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    // ── Создание чатов ──────────────────────────────────────────────────────

    @Serializable private data class DirectReq(val targetUserId: String)
    suspend fun createDirect(targetUserId: String): Chat =
        ApiClient.post("chats/direct", DirectReq(targetUserId))

    @Serializable private data class GroupReq(val name: String, val memberIds: List<String>)
    suspend fun createGroup(name: String, memberIds: List<String>): Chat =
        ApiClient.post("chats/group", GroupReq(name, memberIds))

    // ── Mute ────────────────────────────────────────────────────────────────

    @Serializable private data class MuteReq(val mutedUntil: String? = null)
    @Serializable private data class MuteResp(val mutedUntil: String? = null)

    suspend fun setMute(chatId: String, mutedUntil: String?) {
        ApiClient.post<MuteReq, MuteResp>(
            path = "chats/$chatId/mute",
            body = MuteReq(mutedUntil),
        )
    }

    // ── Clear history ───────────────────────────────────────────────────────

    @Serializable private data class ClearResp(val cleared: Boolean)
    suspend fun clearMessages(chatId: String): Boolean {
        val url = "${AppConfig.API_BASE_URL.trimEnd('/')}/chats/$chatId/messages".toHttpUrl()
        val req = Request.Builder().url(url).delete().apply {
            ApiClient.accessToken?.let { header("Authorization", "Bearer $it") }
            header("Accept", "application/json")
        }.build()
        val resp = http.newCall(req).execute()
        return resp.isSuccessful
    }

    // ── Search ──────────────────────────────────────────────────────────────

    suspend fun search(chatId: String, q: String): List<Message> =
        ApiClient.get("chats/$chatId/messages/search", query = mapOf("q" to q))

    // ── Group admin ─────────────────────────────────────────────────────────

    @Serializable private data class RenameReq(val name: String)
    suspend fun renameGroup(chatId: String, name: String): Chat {
        val url = "${AppConfig.API_BASE_URL.trimEnd('/')}/chats/$chatId".toHttpUrl()
        val bodyJson = kotlinx.serialization.json.Json.encodeToString(RenameReq.serializer(), RenameReq(name))
        val req = Request.Builder().url(url).patch(
            bodyJson.toRequestBody("application/json; charset=utf-8".toMediaType())
        ).apply {
            ApiClient.accessToken?.let { header("Authorization", "Bearer $it") }
            header("Accept", "application/json")
        }.build()
        val resp = http.newCall(req).execute()
        if (!resp.isSuccessful) throw RuntimeException("rename failed: ${resp.code}")
        return kotlinx.serialization.json.Json { ignoreUnknownKeys = true }.let { j ->
            val raw = resp.body?.string().orEmpty()
            val env = j.decodeFromString(
                online.akkdmsg.dakka.data.ApiEnvelope.serializer(Chat.serializer()),
                raw,
            )
            env.data ?: throw RuntimeException("empty rename response")
        }
    }

    // ── Pin / Archive / Mute (PATCH) ────────────────────────────────────────

    @Serializable private data class PinReq(val pinned: Boolean)
    @Serializable private data class ArchiveReq(val archived: Boolean)
    @Serializable private data class MuteUntilReq(val until: String? = null)

    /**
     * @throws ApiClient.ApiException В частности statusCode=400 — лимит закрепов исчерпан.
     */
    suspend fun pinChat(chatId: String, pinned: Boolean) {
        patchVoid(
            path = "chats/$chatId/pin",
            bodyJson = ApiClient.json.encodeToString(PinReq.serializer(), PinReq(pinned)),
        )
    }

    suspend fun archiveChat(chatId: String, archived: Boolean) {
        patchVoid(
            path = "chats/$chatId/archive",
            bodyJson = ApiClient.json.encodeToString(ArchiveReq.serializer(), ArchiveReq(archived)),
        )
    }

    /**
     * @param until ISO-8601, "forever", или null (снять mute).
     */
    suspend fun muteChat(chatId: String, until: String?) {
        patchVoid(
            path = "chats/$chatId/mute",
            bodyJson = ApiClient.json.encodeToString(MuteUntilReq.serializer(), MuteUntilReq(until)),
        )
    }

    suspend fun listArchivedChats(): List<Chat> =
        ApiClient.get("chats/archived")

    suspend fun listChats(includeArchived: Boolean = false): List<Chat> =
        if (includeArchived) ApiClient.get("chats", query = mapOf("includeArchived" to "1"))
        else ApiClient.get("chats")

    /** PATCH без разбора тела ответа — только проверка success + парсинг error message. */
    private suspend fun patchVoid(
        path: String,
        bodyJson: String,
    ) = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        val url = "${AppConfig.API_BASE_URL.trimEnd('/')}/${path.trimStart('/')}".toHttpUrl()
        val req = Request.Builder().url(url).patch(
            bodyJson.toRequestBody("application/json; charset=utf-8".toMediaType())
        ).apply {
            ApiClient.accessToken?.let { header("Authorization", "Bearer $it") }
            header("Accept", "application/json")
        }.build()
        val resp = http.newCall(req).execute()
        if (!resp.isSuccessful) {
            val raw = resp.body?.string().orEmpty()
            val msg = runCatching {
                ApiClient.json.decodeFromString(
                    ApiEnvelope.serializer(kotlinx.serialization.json.JsonElement.serializer()),
                    raw,
                ).error?.message
            }.getOrNull() ?: "HTTP ${resp.code}"
            throw ApiClient.ApiException(resp.code, msg)
        }
    }

    @Serializable private data class AddMembersReq(val userIds: List<String>)
    @Serializable private data class AddMembersResp(val added: List<String>, val members: List<ChatMember>)
    suspend fun addGroupMembers(chatId: String, userIds: List<String>): List<ChatMember> {
        val resp: AddMembersResp = ApiClient.post(
            path = "chats/$chatId/members",
            body = AddMembersReq(userIds),
        )
        return resp.members
    }

    /** Универсально: kick (если userId не наш) или leave (если наш). */
    suspend fun removeMember(chatId: String, userId: String): Boolean {
        val url = "${AppConfig.API_BASE_URL.trimEnd('/')}/chats/$chatId/members/$userId".toHttpUrl()
        val req = Request.Builder().url(url).delete().apply {
            ApiClient.accessToken?.let { header("Authorization", "Bearer $it") }
            header("Accept", "application/json")
        }.build()
        val resp = http.newCall(req).execute()
        return resp.isSuccessful
    }
}
