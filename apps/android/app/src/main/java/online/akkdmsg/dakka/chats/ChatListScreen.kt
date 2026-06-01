package online.akkdmsg.dakka.chats

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import online.akkdmsg.dakka.auth.AuthStore
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.api.ApiClient
import online.akkdmsg.dakka.data.api.ChatActions
import online.akkdmsg.dakka.data.api.SocketClient
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.Avatar
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun ChatListScreen(
    onChatClick: (String) -> Unit,
    onSettingsClick: () -> Unit,
    onNewChatClick: () -> Unit,
    onNewGroupClick: () -> Unit,
    onArchiveClick: () -> Unit = {},
    vm: ChatListViewModel = viewModel(),
) {
    val context = LocalContext.current
    val auth = remember { AuthStore.get(context) }
    val user by auth.user.collectAsState()
    val socketConnected by SocketClient.connected.collectAsState()
    val chats by vm.filteredChats.collectAsState()
    val archivedCount by vm.archivedCount.collectAsState()
    val loading by vm.loading.collectAsState()
    val error by vm.error.collectAsState()
    val search by vm.search.collectAsState()
    val scope = rememberCoroutineScope()

    var menuChat by remember { mutableStateOf<Chat?>(null) }

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()

        Column(Modifier.fillMaxSize().padding(top = 24.dp)) {
            // Header
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Avatar(
                    url = user?.avatar,
                    name = user?.displayName ?: "?",
                    size = 42,
                    online = true,
                )
                Column(Modifier.weight(1f)) {
                    Text(
                        text = user?.displayName ?: "—",
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = if (socketConnected) "● в сети" else "○ соединение…",
                        color = if (socketConnected) DakkaColor.Online else Color.White.copy(alpha = 0.4f),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                var newMenuOpen by remember { mutableStateOf(false) }
                Box {
                    IconButton(onClick = { newMenuOpen = true }) {
                        Icon(Icons.Filled.Edit, contentDescription = "Новый чат",
                            tint = Color.White.copy(alpha = 0.85f))
                    }
                    DropdownMenu(
                        expanded = newMenuOpen,
                        onDismissRequest = { newMenuOpen = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text("Новый чат") },
                            leadingIcon = { Icon(Icons.Filled.Person, null) },
                            onClick = { newMenuOpen = false; onNewChatClick() },
                        )
                        DropdownMenuItem(
                            text = { Text("Новая группа") },
                            leadingIcon = { Icon(Icons.Filled.Group, null) },
                            onClick = { newMenuOpen = false; onNewGroupClick() },
                        )
                    }
                }
                IconButton(onClick = onSettingsClick) {
                    Icon(Icons.Filled.Settings, contentDescription = "Настройки",
                        tint = Color.White.copy(alpha = 0.7f))
                }
            }

            // Search bar
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.04f))
                    .border(1.dp, Color.White.copy(alpha = 0.07f), CircleShape)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Search, null, tint = Color.White.copy(alpha = 0.4f), modifier = Modifier.size(16.dp))
                Box(Modifier.weight(1f)) {
                    BasicTextField(
                        value = search,
                        onValueChange = vm::setSearch,
                        singleLine = true,
                        cursorBrush = SolidColor(DakkaColor.Violet),
                        textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.White),
                    )
                    if (search.isEmpty()) {
                        Text("Поиск чатов…", color = Color.White.copy(alpha = 0.3f), style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }

            // Archive bar
            AnimatedVisibility(
                visible = archivedCount > 0,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier.animateContentSize(),
            ) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White.copy(alpha = 0.04f))
                        .clickable(onClick = onArchiveClick)
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Filled.Archive,
                        contentDescription = null,
                        tint = DakkaColor.Violet,
                        modifier = Modifier.size(20.dp),
                    )
                    Text(
                        text = "Архив",
                        color = Color.White,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = archivedCount.toString(),
                        color = Color.White.copy(alpha = 0.6f),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            Spacer(Modifier.height(4.dp))

            // Content
            when {
                loading && chats.isEmpty() -> Box(
                    Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = DakkaColor.Violet)
                }
                error != null && chats.isEmpty() -> Box(
                    Modifier.fillMaxSize().padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = error.orEmpty(),
                        color = DakkaColor.DangerSoft,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                chats.isEmpty() -> EmptyChatsState()
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 4.dp),
                    contentPadding = PaddingValues(bottom = 24.dp),
                ) {
                    items(chats, key = { it.id }) { chat ->
                        ChatListRow(
                            chat = chat,
                            currentUserId = user?.id,
                            onClick = { onChatClick(chat.id) },
                            onLongClick = { menuChat = chat },
                            modifier = Modifier.animateContentSize(),
                        )
                    }
                }
            }
        }

        menuChat?.let { chat ->
            ChatRowContextMenu(
                chat = chat,
                currentUserId = user?.id,
                onDismiss = { menuChat = null },
                onTogglePin = {
                    scope.launch {
                        runCatching { ChatActions.pinChat(chat.id, chat.pinnedAt == null) }
                            .onFailure { e ->
                                val msg = if (e is ApiClient.ApiException && e.statusCode == 400)
                                    "Можно закрепить не больше 5 чатов"
                                else e.message ?: "Не удалось"
                                Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                            }
                    }
                },
                onToggleArchive = {
                    scope.launch {
                        runCatching { ChatActions.archiveChat(chat.id, chat.archivedAt == null) }
                            .onFailure { e ->
                                Toast.makeText(
                                    context,
                                    e.message ?: "Не удалось",
                                    Toast.LENGTH_SHORT,
                                ).show()
                            }
                    }
                },
                onMute = { until ->
                    scope.launch {
                        runCatching { ChatActions.muteChat(chat.id, until) }
                            .onFailure { e ->
                                Toast.makeText(
                                    context,
                                    e.message ?: "Не удалось",
                                    Toast.LENGTH_SHORT,
                                ).show()
                            }
                    }
                },
            )
        }
    }
}

@Composable
private fun EmptyChatsState() {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier
                .size(64.dp)
                .clip(CircleShape)
                .background(Brand.gradient),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.ChatBubbleOutline,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(28.dp),
            )
        }
        Spacer(Modifier.height(14.dp))
        Text("Здесь пока тихо", color = Color.White, style = MaterialTheme.typography.titleMedium)
        Text(
            "Чаты появятся когда тебе кто-то напишет",
            color = Color.White.copy(alpha = 0.5f),
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
