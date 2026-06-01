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
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import android.widget.Toast
import online.akkdmsg.dakka.data.Message
import online.akkdmsg.dakka.util.copyToClipboard
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
    onOpenProfile: () -> Unit = {},
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
    val replyingTo by vm.replyingTo.collectAsState()
    val editing by vm.editing.collectAsState()
    var showCircleRecorder by remember { mutableStateOf(false) }
    var showVideoRecorder by remember { mutableStateOf(false) }
    var contextMessage by remember { mutableStateOf<Message?>(null) }
    var forwardMessage by remember { mutableStateOf<Message?>(null) }
    var showSearch by remember { mutableStateOf(false) }

    val listState = rememberLazyListState()

    // Авто-скролл к последнему при новом сообщении
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    // Скролл к конкретному сообщению (из поиска)
    val scrollTarget by vm.scrollTarget.collectAsState()
    LaunchedEffect(scrollTarget, messages.size) {
        val tid = scrollTarget ?: return@LaunchedEffect
        val idx = messages.indexOfFirst { it.id == tid }
        if (idx >= 0) {
            listState.animateScrollToItem(idx)
            vm.consumeScrollTarget()
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
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(
                            interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                            indication = null,
                            onClick = onOpenProfile,
                        ),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
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
                }  // конец Row (clickable обёртка аватара+имени)
                CallIconButton(Icons.Filled.Search) { showSearch = true }
                // Кнопки звонка — direct-чат
                val otherMember = vm.chatRef.members.firstOrNull { it.userId != userId }
                if (chat.type == "direct" && otherMember != null) {
                    CallIconButton(Icons.Filled.Phone) {
                        online.akkdmsg.dakka.call.CallManager.startCall(
                            otherMember, chat.id, online.akkdmsg.dakka.call.CallType.Audio
                        )
                    }
                    CallIconButton(Icons.Filled.Videocam) {
                        online.akkdmsg.dakka.call.CallManager.startCall(
                            otherMember, chat.id, online.akkdmsg.dakka.call.CallType.Video
                        )
                    }
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
                                currentUserId = userId,
                                onLongPress = { contextMessage = msg },
                                onReactionToggle = { emoji -> vm.react(msg, emoji) },
                            )
                        }
                    }
                }
            }

            // Reply / Edit bars
            AnimatedVisibility(visible = replyingTo != null) {
                replyingTo?.let { rp ->
                    ReplyBar(
                        previewText = vm.previewText(rp),
                        authorName = rp.sender?.displayName ?: "—",
                        onCancel = vm::cancelReply,
                    )
                }
            }
            AnimatedVisibility(visible = editing != null) {
                editing?.let { em ->
                    EditBar(
                        previewText = vm.displayContent(em) ?: em.content.orEmpty(),
                        onCancel = vm::cancelEdit,
                    )
                }
            }

            // Input
            MessageInput(
                text = draft,
                onTextChange = vm::setDraft,
                onSend = vm::sendDraft,
                onImagePicked = { uri -> vm.sendImage(context, uri) },
                onVideoPicked = { uri -> vm.sendVideoFromUri(context, uri) },
                onVoiceRecorded = { file, dur, wf -> vm.sendVoice(file, dur, wf) },
                onCircleRequested = { showCircleRecorder = true },
                onVideoRequested = { showVideoRecorder = true },
            )
        }

        // Context-menu — long-press
        contextMessage?.let { msg ->
            MessageContextMenu(
                message = msg,
                isOwn = msg.senderId == userId,
                onDismiss = { contextMessage = null },
                onReact = { emoji ->
                    vm.react(msg, emoji)
                    contextMessage = null
                },
                onReply = {
                    vm.beginReply(msg)
                    contextMessage = null
                },
                onCopy = {
                    val text = vm.displayContent(msg) ?: msg.content.orEmpty()
                    context.copyToClipboard(text, sensitive = true)
                    Toast.makeText(context, "Скопировано", Toast.LENGTH_SHORT).show()
                    contextMessage = null
                },
                onEdit = {
                    vm.beginEdit(msg)
                    contextMessage = null
                },
                onDelete = {
                    vm.delete(msg)
                    contextMessage = null
                },
                onForward = {
                    forwardMessage = msg
                    contextMessage = null
                },
            )
        }

        // Forward — выбор чата
        forwardMessage?.let { msg ->
            ForwardSheet(
                excludeChatId = chat.id,
                onDismiss = { forwardMessage = null },
                onPick = { targetChatId ->
                    vm.forward(msg, targetChatId)
                    forwardMessage = null
                    Toast.makeText(context, "Переслано", Toast.LENGTH_SHORT).show()
                },
            )
        }

        // Поиск внутри чата
        if (showSearch) {
            ChatSearchScreen(
                chatId = chat.id,
                onClose = { showSearch = false },
                onResultClick = { messageId ->
                    showSearch = false
                    val idx = messages.indexOfFirst { it.id == messageId }
                    if (idx >= 0) {
                        // scroll сделаем в LaunchedEffect ниже
                        vm.requestScrollTo(messageId)
                    }
                },
            )
        }

        if (showCircleRecorder) {
            CircleRecorderScreen(
                onRecorded = { file, dur ->
                    showCircleRecorder = false
                    vm.sendCircle(file, dur)
                },
                onCancel = { showCircleRecorder = false },
            )
        }

        if (showVideoRecorder) {
            VideoRecorderScreen(
                onRecorded = { file, dur ->
                    showVideoRecorder = false
                    vm.sendVideo(file, dur)
                },
                onCancel = { showVideoRecorder = false },
            )
        }
    }
}

@Composable
private fun CallIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.04f))
            .clickable(
                interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = Color.White.copy(alpha = 0.75f), modifier = Modifier.size(16.dp))
    }
}
