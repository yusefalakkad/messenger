package online.akkdmsg.dakka.chats

import android.widget.Toast
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import online.akkdmsg.dakka.auth.AuthStore
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.api.ChatActions
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.theme.DakkaColor

/**
 * Экран архивных чатов.
 * По long-press — bottom-sheet только с действием "Разархивировать".
 * По tap — открыть чат как обычно.
 */
@Composable
fun ArchiveScreen(
    onBack: () -> Unit,
    onChatClick: (String) -> Unit,
    vm: ChatListViewModel = viewModel(),
) {
    val context = LocalContext.current
    val auth = remember { AuthStore.get(context) }
    val user by auth.user.collectAsState()
    val archived by vm.archivedChats.collectAsState()
    val scope = rememberCoroutineScope()

    var menuChat by remember { mutableStateOf<Chat?>(null) }

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()

        Column(Modifier.fillMaxSize().padding(top = 24.dp)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 8.dp).padding(bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Назад",
                        tint = Color.White.copy(alpha = 0.85f),
                    )
                }
                Text(
                    text = "Архив",
                    color = Color.White,
                    style = MaterialTheme.typography.titleMedium,
                )
            }

            if (archived.isEmpty()) {
                Column(
                    Modifier.fillMaxSize().padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Icon(
                        Icons.Filled.Archive,
                        contentDescription = null,
                        tint = DakkaColor.Violet,
                        modifier = Modifier.size(48.dp),
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "Архив пуст",
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        "Архивные чаты появятся здесь",
                        color = Color.White.copy(alpha = 0.5f),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 4.dp),
                    contentPadding = PaddingValues(bottom = 24.dp),
                ) {
                    items(archived, key = { it.id }) { chat ->
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
                archivedMode = true,
                onDismiss = { menuChat = null },
                onTogglePin = { /* no-op в архиве */ },
                onToggleArchive = {
                    scope.launch {
                        runCatching { ChatActions.archiveChat(chat.id, false) }
                            .onFailure { e ->
                                Toast.makeText(
                                    context,
                                    e.message ?: "Не удалось",
                                    Toast.LENGTH_SHORT,
                                ).show()
                            }
                    }
                },
                onMute = { /* no-op в архиве */ },
            )
        }
    }
}
