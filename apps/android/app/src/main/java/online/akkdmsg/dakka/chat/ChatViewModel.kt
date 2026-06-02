package online.akkdmsg.dakka.chat

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import online.akkdmsg.dakka.auth.AuthStore
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.MediaPayload
import online.akkdmsg.dakka.data.Message
import online.akkdmsg.dakka.data.SendMessagePayload
import online.akkdmsg.dakka.data.api.ChatApi
import online.akkdmsg.dakka.data.api.MediaService
import online.akkdmsg.dakka.data.api.SocketClient
import online.akkdmsg.dakka.data.crypto.E2E
import online.akkdmsg.dakka.data.isE2E
import online.akkdmsg.dakka.data.otherMember
import online.akkdmsg.dakka.media.ImagePreparer
import java.io.File

class ChatViewModel(
    private val chat: Chat,
    private val currentUserId: String,
    private val privateKey: String?,
) : ViewModel() {

    val chatRef: Chat = chat

    private val _messages = MutableStateFlow<List<Message>>(emptyList())
    val messages: StateFlow<List<Message>> = _messages.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _draft = MutableStateFlow("")
    val draft: StateFlow<String> = _draft.asStateFlow()

    private val _typingUsers = MutableStateFlow<Set<String>>(emptySet())
    val typingUsers: StateFlow<Set<String>> = _typingUsers.asStateFlow()

    private val _replyingTo = MutableStateFlow<Message?>(null)
    val replyingTo: StateFlow<Message?> = _replyingTo.asStateFlow()

    private val _editing = MutableStateFlow<Message?>(null)
    val editing: StateFlow<Message?> = _editing.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    val isE2E: Boolean get() = chat.isE2E
    val peerName: String get() = chat.otherMember(currentUserId)?.user?.displayName ?: chat.name.orEmpty()
    val peerAvatar: String? get() = chat.otherMember(currentUserId)?.user?.avatar ?: chat.avatar

    private var typingTimer: Job? = null

    init {
        load()
        subscribeToSocket()
    }

    fun setDraft(s: String) {
        _draft.value = s
        onTextChange()
    }

    private fun load() {
        viewModelScope.launch {
            _loading.value = true
            try {
                _messages.value = ChatApi.listMessages(chat.id)
                    .sortedBy { it.createdAt }
            } catch (e: Exception) {
                _error.value = e.message ?: "Не удалось загрузить сообщения"
            } finally {
                _loading.value = false
            }
        }
    }

    fun sendDraft() {
        val t = _draft.value.trim()
        if (t.isEmpty()) return
        SocketClient.setTyping(chat.id, false)

        // Edit mode: отправляем message:edit вместо нового сообщения
        val editingMsg = _editing.value
        if (editingMsg != null) {
            if (isE2E) {
                // SECURITY: при E2E-чате edit ОБЯЗАН быть зашифрован. Никакого
                // silent plaintext fallback.
                val recipient = chat.otherMember(currentUserId)
                val recipientPub = recipient?.user?.publicKey
                if (privateKey.isNullOrBlank() || recipientPub.isNullOrBlank()) {
                    _error.value = "Не удалось зашифровать: ключ недоступен. Перелогиньтесь."
                    return
                }
                val enc = try {
                    E2E.encryptText(t, recipientPub, privateKey)
                } catch (e: Exception) {
                    _error.value = "Ошибка шифрования. Сообщение не изменено."
                    return
                }
                _editing.value = null
                _draft.value = ""
                SocketClient.editMessage(editingMsg.id, chat.id, enc.ciphertextB64, enc.nonceB64, true)
            } else {
                _editing.value = null
                _draft.value = ""
                SocketClient.editMessage(editingMsg.id, chat.id, t, null, false)
            }
            return
        }

        val replyId = _replyingTo.value?.id
        val recipient = chat.otherMember(currentUserId)
        val recipientPub = recipient?.user?.publicKey

        val payload: SendMessagePayload = if (isE2E) {
            // SECURITY: E2E-чат ОБЯЗАН быть зашифрован. Никакого silent plaintext.
            if (privateKey.isNullOrBlank()) {
                _error.value = "Не удалось отправить: приватный ключ недоступен. Перелогиньтесь."
                return
            }
            if (recipientPub.isNullOrBlank()) {
                _error.value = "У получателя нет ключа шифрования."
                return
            }
            val enc = try {
                E2E.encryptText(t, recipientPub, privateKey)
            } catch (e: Exception) {
                _error.value = "Ошибка шифрования. Сообщение не отправлено."
                return
            }
            _draft.value = ""
            _replyingTo.value = null
            SendMessagePayload(
                chatId = chat.id, type = "text",
                content = enc.ciphertextB64, nonce = enc.nonceB64,
                encrypted = true, replyToId = replyId,
            )
        } else {
            _draft.value = ""
            _replyingTo.value = null
            SendMessagePayload(chatId = chat.id, type = "text", content = t,
                encrypted = false, replyToId = replyId)
        }
        SocketClient.send(payload)
    }

    // ── Reply / Edit / Delete / React / Forward ──────────────────────────────

    fun beginReply(message: Message) {
        _replyingTo.value = message
        _editing.value = null
    }
    fun cancelReply() { _replyingTo.value = null }

    fun beginEdit(message: Message) {
        if (message.senderId != currentUserId) return
        _editing.value = message
        _replyingTo.value = null
        _draft.value = displayContent(message) ?: message.content.orEmpty()
    }
    fun cancelEdit() {
        _editing.value = null
        _draft.value = ""
    }

    fun react(message: Message, emoji: String) {
        SocketClient.reactToMessage(message.id, chat.id, emoji)
    }

    fun delete(message: Message) {
        SocketClient.deleteMessageRemote(message.id, chat.id)
        // Локально удаляем для отзывчивости
        _messages.value = _messages.value.filter { it.id != message.id }
    }

    fun forward(message: Message, targetChatId: String) {
        SocketClient.send(SendMessagePayload(
            chatId = targetChatId,
            type = message.type,
            forwardedFromId = message.id,
        ))
    }

    /** Короткое превью для ReplyBar/cited-message. */
    fun previewText(msg: Message): String = when (msg.type) {
        "voice"  -> "🎙 Голосовое"
        "image"  -> "📷 Фото"
        "circle" -> "⭕ Видео-кружок"
        "video"  -> "🎬 Видео"
        "file"   -> "📎 Файл"
        else     -> displayContent(msg)?.takeIf { it.isNotBlank() } ?: msg.content.orEmpty()
    }

    private val _scrollTarget = MutableStateFlow<String?>(null)
    val scrollTarget: StateFlow<String?> = _scrollTarget.asStateFlow()
    fun requestScrollTo(messageId: String) { _scrollTarget.value = messageId }
    fun consumeScrollTarget() { _scrollTarget.value = null }

    /**
     * Возвращает текст для отображения: расшифрованный (если encrypted),
     * иначе plaintext content, иначе null.
     */
    fun displayContent(msg: Message): String? {
        val raw = msg.content ?: return null
        if (msg.encrypted != true) return raw

        val nonce = msg.nonce ?: return null
        val myPriv = privateKey ?: return null

        // E2E симметрично: ECDH(my_priv, their_pub) даёт тот же AES key для обоих
        val theirPub = if (msg.senderId == currentUserId) {
            chat.otherMember(currentUserId)?.user?.publicKey
        } else {
            msg.sender?.publicKey ?: chat.otherMember(currentUserId)?.user?.publicKey
        } ?: return null

        return try {
            E2E.decryptText(
                ciphertextB64 = raw,
                nonceB64 = nonce,
                senderPublicKeyB64 = theirPub,
                recipientPrivateKeyB64 = myPriv,
            )
        } catch (_: Exception) {
            null
        }
    }

    // ── Голос ────────────────────────────────────────────────────────────────

    fun sendVoice(file: File, durationSec: Int, waveform: List<Float>) {
        viewModelScope.launch {
            try {
                val media = MediaService.uploadVoice(file, durationSec, waveform)
                val payload = SendMessagePayload(
                    chatId = chat.id,
                    type = "voice",
                    mediaData = MediaPayload(
                        url = media.url,
                        mimeType = media.mimeType,
                        size = media.size,
                        duration = durationSec.toDouble(),
                        waveform = waveform.map { it.toDouble() },
                    ),
                )
                SocketClient.send(payload)
                file.delete()
            } catch (e: Exception) {
                _error.value = "Не удалось отправить голосовое: ${e.message}"
            }
        }
    }

    // ── Картинка ─────────────────────────────────────────────────────────────

    fun sendImage(context: android.content.Context, uri: android.net.Uri) {
        viewModelScope.launch {
            try {
                val prepared = ImagePreparer.fromUri(context, uri) ?: return@launch
                val media = MediaService.uploadImage(prepared.file, prepared.mimeType, prepared.fileName)
                val payload = SendMessagePayload(
                    chatId = chat.id,
                    type = "image",
                    mediaData = MediaPayload(
                        url = media.url,
                        mimeType = media.mimeType,
                        size = media.size,
                        width = media.width ?: prepared.width,
                        height = media.height ?: prepared.height,
                    ),
                )
                SocketClient.send(payload)
                prepared.file.delete()
            } catch (e: Exception) {
                _error.value = "Не удалось отправить фото: ${e.message}"
            }
        }
    }

    // ── Видео (полноразмерное) ───────────────────────────────────────────────

    fun sendVideo(file: File, durationSec: Int) {
        viewModelScope.launch {
            try {
                if (file.length() > 100L * 1024 * 1024) {
                    _error.value = "Видео слишком большое (макс. 100 МБ)"
                    file.delete()
                    return@launch
                }
                val media = MediaService.uploadVideo(file, durationSec)
                val payload = SendMessagePayload(
                    chatId = chat.id,
                    type = "video",
                    mediaData = MediaPayload(
                        url = media.url,
                        mimeType = media.mimeType,
                        size = media.size,
                        duration = durationSec.toDouble(),
                        width = media.width,
                        height = media.height,
                    ),
                )
                SocketClient.send(payload)
                file.delete()
            } catch (e: Exception) {
                _error.value = "Не удалось отправить видео: ${e.message}"
            }
        }
    }

    /**
     * Загрузить готовый видео-файл из системного picker'а (content:// uri).
     * Копирует во временный кэш-файл и шлёт через [sendVideo].
     */
    fun sendVideoFromUri(context: android.content.Context, uri: android.net.Uri) {
        viewModelScope.launch {
            try {
                val resolver = context.contentResolver
                val tmp = File(context.cacheDir, "video-pick-${System.currentTimeMillis()}.mp4")
                resolver.openInputStream(uri)?.use { input ->
                    tmp.outputStream().use { out -> input.copyTo(out) }
                } ?: run {
                    _error.value = "Не удалось прочитать видео"
                    return@launch
                }
                if (tmp.length() > 100L * 1024 * 1024) {
                    _error.value = "Видео слишком большое (макс. 100 МБ)"
                    tmp.delete()
                    return@launch
                }
                // duration не известен из uri — оставим 0, сервер всё равно сохранит как есть
                sendVideo(tmp, 0)
            } catch (e: Exception) {
                _error.value = "Не удалось отправить видео: ${e.message}"
            }
        }
    }

    // ── Кружок ───────────────────────────────────────────────────────────────

    fun sendCircle(file: File, durationSec: Int) {
        viewModelScope.launch {
            try {
                val media = MediaService.uploadCircle(file, durationSec)
                val payload = SendMessagePayload(
                    chatId = chat.id,
                    type = "circle",
                    mediaData = MediaPayload(
                        url = media.url,
                        mimeType = media.mimeType,
                        size = media.size,
                        duration = durationSec.toDouble(),
                        width = media.width,
                        height = media.height,
                    ),
                )
                SocketClient.send(payload)
                file.delete()
            } catch (e: Exception) {
                _error.value = "Не удалось отправить кружок: ${e.message}"
            }
        }
    }

    // ── Typing indicator с 2-секундным дебаунсом ──────────────────────────────

    private fun onTextChange() {
        SocketClient.setTyping(chat.id, true)
        typingTimer?.cancel()
        typingTimer = viewModelScope.launch {
            delay(2000)
            SocketClient.setTyping(chat.id, false)
        }
    }

    // ── Socket subscriptions ──────────────────────────────────────────────────

    private fun subscribeToSocket() {
        viewModelScope.launch {
            SocketClient.messageReceived.collect { msg ->
                if (msg.chatId != chat.id) return@collect
                if (_messages.value.any { it.id == msg.id }) return@collect
                _messages.value = _messages.value + msg
                // авто-mark-read если входящее
                if (msg.senderId != currentUserId) {
                    SocketClient.markRead(msg.id, chat.id)
                }
            }
        }
        viewModelScope.launch {
            SocketClient.messageDeleted.collect { event ->
                if (event.chatId != chat.id) return@collect
                _messages.value = _messages.value.filter { it.id != event.messageId }
            }
        }
        viewModelScope.launch {
            SocketClient.typingChanged.collect { event ->
                if (event.chatId != chat.id || event.userId == currentUserId) return@collect
                _typingUsers.value = if (event.isTyping) _typingUsers.value + event.userId
                                    else _typingUsers.value - event.userId
            }
        }
        // Реакции, edit — бэк шлёт только messageId; перезатягиваем список.
        viewModelScope.launch {
            SocketClient.messageUpdated.collect { messageId ->
                if (!_messages.value.any { it.id == messageId }) return@collect
                try {
                    _messages.value = ChatApi.listMessages(chat.id).sortedBy { it.createdAt }
                } catch (_: Exception) { /* offline-ok */ }
            }
        }
    }
}
