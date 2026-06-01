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
import online.akkdmsg.dakka.data.Message
import online.akkdmsg.dakka.data.SendMessagePayload
import online.akkdmsg.dakka.data.api.ChatApi
import online.akkdmsg.dakka.data.api.SocketClient
import online.akkdmsg.dakka.data.crypto.E2E
import online.akkdmsg.dakka.data.isE2E
import online.akkdmsg.dakka.data.otherMember

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
        _draft.value = ""
        SocketClient.setTyping(chat.id, false)

        val recipient = chat.otherMember(currentUserId)
        val recipientPub = recipient?.user?.publicKey
        val payload: SendMessagePayload = if (isE2E && privateKey != null && !recipientPub.isNullOrBlank()) {
            try {
                val enc = E2E.encryptText(t, recipientPub, privateKey)
                SendMessagePayload(
                    chatId = chat.id,
                    type = "text",
                    content = enc.ciphertextB64,
                    nonce = enc.nonceB64,
                    encrypted = true,
                )
            } catch (e: Exception) {
                // fallback на plaintext если шифрование сломалось
                SendMessagePayload(chatId = chat.id, type = "text", content = t, encrypted = false)
            }
        } else {
            SendMessagePayload(chatId = chat.id, type = "text", content = t, encrypted = false)
        }
        SocketClient.send(payload)
    }

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
    }
}
