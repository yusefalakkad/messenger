package online.akkdmsg.dakka.chats

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Settings
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
import online.akkdmsg.dakka.auth.AuthStore
import online.akkdmsg.dakka.data.api.SocketClient
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.Avatar
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun ChatListScreen(
    onChatClick: (String) -> Unit,
    onSettingsClick: () -> Unit,
    vm: ChatListViewModel = viewModel(),
) {
    val context = LocalContext.current
    val auth = remember { AuthStore.get(context) }
    val user by auth.user.collectAsState()
    val socketConnected by SocketClient.connected.collectAsState()
    val chats by vm.filteredChats.collectAsState()
    val loading by vm.loading.collectAsState()
    val error by vm.error.collectAsState()
    val search by vm.search.collectAsState()

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
                IconButton(onClick = onSettingsClick) {
                    Icon(Icons.Filled.Settings, contentDescription = "Настройки", tint = Color.White.copy(alpha = 0.7f))
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

            Spacer(Modifier.height(12.dp))

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
                        )
                    }
                }
            }
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
