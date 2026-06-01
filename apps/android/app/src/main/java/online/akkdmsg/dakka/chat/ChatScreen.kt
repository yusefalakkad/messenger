package online.akkdmsg.dakka.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Videocam
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import online.akkdmsg.dakka.auth.AuthStore
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.Avatar
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun ChatScreen(
    chat: Chat,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val auth = remember { AuthStore.get(context) }
    val user by auth.user.collectAsState()
    val userId = user?.id ?: return

    val vm: ChatViewModel = viewModel(
        key = "chat:${chat.id}",
        factory = viewModelFactory {
            initializer { ChatViewModel(chat, userId, auth.privateKey) }
        },
    )

    val messages by vm.messages.collectAsState()
    val draft by vm.draft.collectAsState()
    val typing by vm.typingUsers.collectAsState()
    val loading by vm.loading.collectAsState()

    val listState = rememberLazyListState()

    // Авто-скролл к последнему при новом сообщении
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()

        Column(Modifier.fillMaxSize()) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DakkaColor.Surface.copy(alpha = 0.7f))
                    .padding(start = 8.dp, end = 12.dp, top = 28.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Назад",
                        tint = Color.White.copy(alpha = 0.85f),
                    )
                }
                Avatar(
                    url = vm.peerAvatar,
                    name = vm.peerName,
                    size = 38,
                )
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = vm.peerName,
                            color = Color.White,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        if (vm.isE2E) {
                            Icon(
                                Icons.Filled.Shield, null,
                                tint = DakkaColor.Violet,
                                modifier = Modifier.size(13.dp),
                            )
                        }
                    }
                    val subtitle = when {
                        typing.isNotEmpty() -> "печатает…"
                        else -> ""
                    }
                    if (subtitle.isNotEmpty()) {
                        Text(
                            text = subtitle,
                            color = DakkaColor.Violet,
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                }
                // Placeholder кнопки звонков (полная реализация — сессия 5)
                Box(Modifier.size(36.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.04f)),
                    contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Phone, null, tint = Color.White.copy(alpha = 0.45f), modifier = Modifier.size(16.dp))
                }
                Box(Modifier.size(36.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.04f)),
                    contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Videocam, null, tint = Color.White.copy(alpha = 0.45f), modifier = Modifier.size(16.dp))
                }
            }

            // E2E banner
            AnimatedVisibility(visible = vm.isE2E) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(DakkaColor.Violet.copy(alpha = 0.08f))
                        .padding(vertical = 5.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Shield, null, tint = DakkaColor.Violet, modifier = Modifier.size(12.dp))
                    Spacer(Modifier.size(6.dp))
                    Text(
                        "Сообщения защищены сквозным шифрованием",
                        color = DakkaColor.Violet.copy(alpha = 0.85f),
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }

            // Messages
            Box(Modifier.weight(1f)) {
                if (loading && messages.isEmpty()) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = DakkaColor.Violet)
                    }
                } else if (messages.isEmpty()) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            "Скажите «привет»",
                            color = Color.White.copy(alpha = 0.5f),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize().padding(horizontal = 10.dp),
                        contentPadding = PaddingValues(vertical = 8.dp),
                    ) {
                        items(messages, key = { it.id }) { msg ->
                            MessageBubble(
                                message = msg,
                                isOwn = msg.senderId == userId,
                                decrypted = vm.displayContent(msg),
                            )
                        }
                    }
                }
            }

            // Input
            MessageInput(
                text = draft,
                onTextChange = vm::setDraft,
                onSend = vm::sendDraft,
            )
        }
    }
}
