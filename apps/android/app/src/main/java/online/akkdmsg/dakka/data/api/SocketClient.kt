package online.akkdmsg.dakka.data.api

import io.socket.client.IO
import io.socket.client.Socket
import io.socket.engineio.client.transports.WebSocket
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import online.akkdmsg.dakka.call.CallAcceptedEvent
import online.akkdmsg.dakka.call.CallEndedEvent
import online.akkdmsg.dakka.call.CallSignal
import online.akkdmsg.dakka.call.CallSignalEvent
import online.akkdmsg.dakka.call.CallType
import online.akkdmsg.dakka.call.IncomingCallEvent
import online.akkdmsg.dakka.data.AppConfig
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.Message
import online.akkdmsg.dakka.data.SendMessagePayload
import org.json.JSONObject
import java.net.URI

/**
 * Real-time клиент к бэкенду через socket.io v4.
 * Один синглтон, подключается при логине, отписывается при logout.
 *
 * Compose-стороны подписываются на Flow-публикаторы через collectAsState/LaunchedEffect.
 */
object SocketClient {

    // ── State ────────────────────────────────────────────────────────────────

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    // ── Event flows ──────────────────────────────────────────────────────────

    private val _messageReceived = MutableSharedFlow<Message>(extraBufferCapacity = 32)
    val messageReceived: SharedFlow<Message> = _messageReceived.asSharedFlow()

    private val _messageDeleted = MutableSharedFlow<MessageDeleted>(extraBufferCapacity = 16)
    val messageDeleted: SharedFlow<MessageDeleted> = _messageDeleted.asSharedFlow()

    private val _messageUpdated = MutableSharedFlow<String>(extraBufferCapacity = 16) // messageId
    val messageUpdated: SharedFlow<String> = _messageUpdated.asSharedFlow()

    private val _messageRead = MutableSharedFlow<MessageRead>(extraBufferCapacity = 16)
    val messageRead: SharedFlow<MessageRead> = _messageRead.asSharedFlow()

    private val _typingChanged = MutableSharedFlow<TypingEvent>(extraBufferCapacity = 16)
    val typingChanged: SharedFlow<TypingEvent> = _typingChanged.asSharedFlow()

    private val _userStatus = MutableSharedFlow<UserStatusEvent>(extraBufferCapacity = 16)
    val userStatus: SharedFlow<UserStatusEvent> = _userStatus.asSharedFlow()

    private val _chatCreated = MutableSharedFlow<Chat>(extraBufferCapacity = 8)
    val chatCreated: SharedFlow<Chat> = _chatCreated.asSharedFlow()

    private val _chatUpdated = MutableSharedFlow<String>(extraBufferCapacity = 8) // chatId
    val chatUpdated: SharedFlow<String> = _chatUpdated.asSharedFlow()

    private val _chatRemoved = MutableSharedFlow<String>(extraBufferCapacity = 8) // chatId
    val chatRemoved: SharedFlow<String> = _chatRemoved.asSharedFlow()

    private val _chatStateUpdated = MutableSharedFlow<ChatStateUpdate>(extraBufferCapacity = 16)
    val chatStateUpdated: SharedFlow<ChatStateUpdate> = _chatStateUpdated.asSharedFlow()

    // Calls
    private val _callIncoming = MutableSharedFlow<IncomingCallEvent>(extraBufferCapacity = 4)
    val callIncoming: SharedFlow<IncomingCallEvent> = _callIncoming.asSharedFlow()
    private val _callAccepted = MutableSharedFlow<CallAcceptedEvent>(extraBufferCapacity = 4)
    val callAccepted: SharedFlow<CallAcceptedEvent> = _callAccepted.asSharedFlow()
    private val _callEnded = MutableSharedFlow<CallEndedEvent>(extraBufferCapacity = 4)
    val callEnded: SharedFlow<CallEndedEvent> = _callEnded.asSharedFlow()
    private val _callSignal = MutableSharedFlow<CallSignalEvent>(extraBufferCapacity = 64)
    val callSignal: SharedFlow<CallSignalEvent> = _callSignal.asSharedFlow()

    // ── Internal ─────────────────────────────────────────────────────────────

    private var socket: Socket? = null
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /** Подключиться. Идемпотентно — повторный вызов переподключает. */
    fun connect() {
        val token = ApiClient.accessToken ?: return
        if (socket?.connected() == true) return

        disconnect()

        val opts = IO.Options().apply {
            forceNew = true
            reconnection = true
            reconnectionDelay = 1000
            reconnectionAttempts = Int.MAX_VALUE
            transports = arrayOf(WebSocket.NAME)
            auth = mutableMapOf("token" to token)
            extraHeaders = mapOf("Authorization" to listOf("Bearer $token"))
        }

        val s = IO.socket(URI.create(AppConfig.SOCKET_BASE_URL), opts)
        socket = s
        wireHandlers(s)
        s.connect()
    }

    fun disconnect() {
        socket?.off()
        socket?.disconnect()
        socket = null
        _connected.value = false
    }

    // ── Emitters ─────────────────────────────────────────────────────────────

    fun send(payload: SendMessagePayload) {
        val jsonStr = json.encodeToString(SendMessagePayload.serializer(), payload)
        socket?.emit("message:send", JSONObject(jsonStr))
    }

    fun setTyping(chatId: String, isTyping: Boolean) {
        socket?.emit("message:typing", JSONObject().apply {
            put("chatId", chatId); put("isTyping", isTyping)
        })
    }

    fun markRead(messageId: String, chatId: String) {
        socket?.emit("message:read", JSONObject().apply {
            put("messageId", messageId); put("chatId", chatId)
        })
    }

    fun reactToMessage(messageId: String, chatId: String, emoji: String) {
        socket?.emit("message:react", JSONObject().apply {
            put("messageId", messageId); put("chatId", chatId); put("emoji", emoji)
        })
    }

    fun deleteMessageRemote(messageId: String, chatId: String) {
        socket?.emit("message:delete", JSONObject().apply {
            put("messageId", messageId); put("chatId", chatId)
        })
    }

    fun editMessage(messageId: String, chatId: String, content: String, nonce: String? = null, encrypted: Boolean = false) {
        socket?.emit("message:edit", JSONObject().apply {
            put("messageId", messageId)
            put("chatId", chatId)
            put("content", content)
            put("encrypted", encrypted)
            if (nonce != null) put("nonce", nonce)
        })
    }

    // ── Call signaling ───────────────────────────────────────────────────────

    fun initiateCall(callId: String, peerId: String, chatId: String, callType: CallType) {
        socket?.emit("call:initiate", JSONObject().apply {
            put("callId", callId); put("peerId", peerId); put("chatId", chatId); put("callType", callType.raw)
        })
    }
    fun acceptCall(callId: String)  { socket?.emit("call:accept", JSONObject().put("callId", callId)) }
    fun rejectCall(callId: String)  { socket?.emit("call:reject", JSONObject().put("callId", callId)) }
    fun endCall(callId: String)     { socket?.emit("call:end",    JSONObject().put("callId", callId)) }

    fun sendCallSignal(callId: String, signal: CallSignal) {
        val signalJson = json.encodeToString(CallSignal.serializer(), signal)
        socket?.emit("call:signal", JSONObject().apply {
            put("callId", callId)
            put("signal", JSONObject(signalJson))
        })
    }

    // ── Wiring ───────────────────────────────────────────────────────────────

    private fun wireHandlers(s: Socket) {
        s.on(Socket.EVENT_CONNECT)    { _connected.value = true }
        s.on(Socket.EVENT_DISCONNECT) { _connected.value = false }

        s.on("message:new") { args ->
            decodeJson(args.firstOrNull(), Message.serializer())?.let { _messageReceived.tryEmit(it) }
        }

        s.on("message:deleted") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            val msgId  = o.optString("messageId").takeIf { it.isNotEmpty() } ?: return@on
            val chatId = o.optString("chatId").takeIf { it.isNotEmpty() } ?: return@on
            _messageDeleted.tryEmit(MessageDeleted(msgId, chatId))
        }

        s.on("message:updated") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            val id = o.optString("id").takeIf { it.isNotEmpty() } ?: return@on
            _messageUpdated.tryEmit(id)
        }

        s.on("message:read") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            _messageRead.tryEmit(
                MessageRead(
                    messageId = o.optString("messageId"),
                    chatId    = o.optString("chatId"),
                    userId    = o.optString("userId"),
                    readAt    = o.optString("readAt"),
                )
            )
        }

        s.on("user:typing") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            _typingChanged.tryEmit(
                TypingEvent(
                    chatId   = o.optString("chatId"),
                    userId   = o.optString("userId"),
                    isTyping = o.optBoolean("isTyping"),
                )
            )
        }

        s.on("user:status") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            _userStatus.tryEmit(
                UserStatusEvent(
                    userId = o.optString("userId"),
                    status = o.optString("status"),
                )
            )
        }

        s.on("chat:new") { args ->
            decodeJson(args.firstOrNull(), Chat.serializer())?.let { _chatCreated.tryEmit(it) }
        }

        s.on("chat:updated") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            o.optString("chatId").takeIf { it.isNotEmpty() }?.let { _chatUpdated.tryEmit(it) }
        }

        s.on("chat:removed") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            o.optString("chatId").takeIf { it.isNotEmpty() }?.let { _chatRemoved.tryEmit(it) }
        }

        s.on("chat:member-left") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            o.optString("chatId").takeIf { it.isNotEmpty() }?.let { _chatUpdated.tryEmit(it) }
        }

        s.on("chat:state-updated") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            val chatId = o.optString("chatId").takeIf { it.isNotEmpty() } ?: return@on
            // Различаем "поле отсутствует" (нет изменений) vs "поле = null" (сбросить).
            // Для строки: hasKey=false → null + present=false; hasKey=true, null → null + present=true.
            fun str(key: String): Pair<String?, Boolean> =
                if (!o.has(key)) null to false
                else if (o.isNull(key)) null to true
                else o.optString(key).takeIf { it.isNotEmpty() } to true
            fun bool(key: String): Pair<Boolean?, Boolean> =
                if (!o.has(key)) null to false
                else if (o.isNull(key)) null to true
                else o.optBoolean(key) to true
            val pinned = bool("pinned").first
            val archived = bool("archived").first
            val pinnedAtPair = str("pinnedAt")
            val archivedAtPair = str("archivedAt")
            val mutedUntilPair = str("mutedUntil")
            _chatStateUpdated.tryEmit(
                ChatStateUpdate(
                    chatId = chatId,
                    pinned = pinned,
                    archived = archived,
                    pinnedAt = pinnedAtPair.first,
                    archivedAt = archivedAtPair.first,
                    mutedUntil = mutedUntilPair.first,
                    pinnedAtPresent = pinnedAtPair.second,
                    archivedAtPresent = archivedAtPair.second,
                    mutedUntilPresent = mutedUntilPair.second,
                )
            )
        }

        // ── Calls ──
        s.on("call:incoming") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            _callIncoming.tryEmit(IncomingCallEvent(
                callId       = o.optString("callId"),
                chatId       = o.optString("chatId"),
                callerId     = o.optString("callerId"),
                callerName   = o.optString("callerName", "Звонок"),
                callerAvatar = o.optString("callerAvatar").takeIf { it.isNotEmpty() },
                callType     = CallType.from(o.optString("callType")),
            ))
        }
        s.on("call:accepted") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            _callAccepted.tryEmit(CallAcceptedEvent(
                callId = o.optString("callId"),
                peerId = o.optString("peerId"),
            ))
        }
        s.on("call:ended") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            _callEnded.tryEmit(CallEndedEvent(
                callId = o.optString("callId"),
                reason = o.optString("reason").takeIf { it.isNotEmpty() },
            ))
        }
        s.on("call:signal") { args ->
            val o = args.firstOrNull() as? JSONObject ?: return@on
            val callId = o.optString("callId").takeIf { it.isNotEmpty() } ?: return@on
            val sig = o.optJSONObject("signal") ?: return@on
            val signal = runCatching {
                json.decodeFromString(CallSignal.serializer(), sig.toString())
            }.getOrNull() ?: return@on
            _callSignal.tryEmit(CallSignalEvent(callId, signal))
        }
    }

    /** Декодирует org.json.JSONObject в @Serializable через JSON-roundtrip. */
    private fun <T> decodeJson(raw: Any?, serializer: kotlinx.serialization.KSerializer<T>): T? {
        val str = raw?.toString() ?: return null
        return runCatching { json.decodeFromString(serializer, str) }.getOrNull()
    }
}

// ── Event DTOs ───────────────────────────────────────────────────────────────

data class MessageDeleted(val messageId: String, val chatId: String)
data class MessageRead(val messageId: String, val chatId: String, val userId: String, val readAt: String)
data class TypingEvent(val chatId: String, val userId: String, val isTyping: Boolean)
data class UserStatusEvent(val userId: String, val status: String)

/**
 * Событие 'chat:state-updated' — изменения pin/archive/mute текущего пользователя.
 * `*Present` различает "поле не пришло — оставить как есть" от "поле = null — сбросить".
 */
data class ChatStateUpdate(
    val chatId: String,
    val pinned: Boolean?,
    val archived: Boolean?,
    val pinnedAt: String?,
    val archivedAt: String?,
    val mutedUntil: String?,
    val pinnedAtPresent: Boolean = true,
    val archivedAtPresent: Boolean = true,
    val mutedUntilPresent: Boolean = true,
)
