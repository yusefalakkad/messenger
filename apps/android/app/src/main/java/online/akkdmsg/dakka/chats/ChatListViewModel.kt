package online.akkdmsg.dakka.chats

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.launch
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.api.ChatApi
import online.akkdmsg.dakka.data.api.SocketClient

class ChatListViewModel : ViewModel() {

    private val _chats = MutableStateFlow<List<Chat>>(emptyList())
    private val _loading = MutableStateFlow(false)
    private val _error = MutableStateFlow<String?>(null)
    private val _search = MutableStateFlow("")

    val loading: StateFlow<Boolean> = _loading.asStateFlow()
    val error:   StateFlow<String?> = _error.asStateFlow()
    val search:  StateFlow<String>  = _search

    /** Отфильтрованный + отсортированный по lastMessage.createdAt список. */
    val filteredChats: StateFlow<List<Chat>> = combine(_chats, _search) { chats, q ->
        val sorted = chats.sortedByDescending { it.lastMessage?.createdAt ?: "" }
        if (q.isBlank()) sorted
        else sorted.filter { c ->
            (c.name ?: "").contains(q, ignoreCase = true) ||
                c.members.any {
                    it.user.displayName.contains(q, ignoreCase = true) ||
                        it.user.username.contains(q, ignoreCase = true)
                }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        // Real-time обновления — подгружаем список при новом сообщении
        // (бэк не шлёт chat:lastMessage отдельно — проще обновить целиком)
        viewModelScope.launch {
            SocketClient.messageReceived.collect { _ -> reload() }
        }
        viewModelScope.launch {
            SocketClient.chatCreated.collect { chat -> upsert(chat) }
        }
        viewModelScope.launch {
            SocketClient.chatUpdated.collect { _ -> reload() }
        }
        viewModelScope.launch {
            SocketClient.chatRemoved.collect { id ->
                _chats.value = _chats.value.filter { it.id != id }
            }
        }

        reload()
    }

    fun setSearch(q: String) { _search.value = q }

    fun reload() {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                _chats.value = ChatApi.listChats()
            } catch (e: Exception) {
                _error.value = e.message ?: "Не удалось загрузить чаты"
            } finally {
                _loading.value = false
            }
        }
    }

    fun upsert(chat: Chat) {
        val idx = _chats.value.indexOfFirst { it.id == chat.id }
        _chats.value = if (idx >= 0) {
            _chats.value.toMutableList().apply { set(idx, chat) }
        } else {
            listOf(chat) + _chats.value
        }
    }
}
