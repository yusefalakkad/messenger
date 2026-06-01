package online.akkdmsg.dakka.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import online.akkdmsg.dakka.auth.AuthStore
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.api.ChatApi
import online.akkdmsg.dakka.data.otherMember
import online.akkdmsg.dakka.ui.components.Avatar
import online.akkdmsg.dakka.ui.theme.DakkaColor

/**
 * Список чатов для пересылки сообщения. Тап → onPick(chatId).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForwardSheet(
    excludeChatId: String,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
) {
    val context = LocalContext.current
    val auth = remember { AuthStore.get(context) }
    val user by auth.user.collectAsState()
    val userId = user?.id

    val sheetState: SheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var chats by remember { mutableStateOf<List<Chat>>(emptyList()) }

    LaunchedEffect(Unit) {
        chats = runCatching { ChatApi.listChats() }.getOrDefault(emptyList())
            .filter { it.id != excludeChatId }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = DakkaColor.Surface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                "Переслать в…",
                color = Color.White,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 12.dp),
            )

            if (chats.isEmpty()) {
                Box(
                    Modifier.fillMaxWidth().padding(28.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "Нет других чатов",
                        color = Color.White.copy(alpha = 0.4f),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.heightIn(max = 480.dp),
                ) {
                    items(chats, key = { it.id }) { chat ->
                        ForwardRow(chat = chat, currentUserId = userId) { onPick(chat.id) }
                    }
                }
            }
        }
    }
}

@Composable
private fun ForwardRow(chat: Chat, currentUserId: String?, onClick: () -> Unit) {
    val title = when {
        chat.type == "group" -> chat.name.orEmpty().ifEmpty { "Группа" }
        else -> chat.otherMember(currentUserId.orEmpty())?.user?.displayName ?: "—"
    }
    val avatar = when {
        chat.type == "group" -> chat.avatar
        else -> chat.otherMember(currentUserId.orEmpty())?.user?.avatar ?: chat.avatar
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 18.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Avatar(url = avatar, name = title, size = 40)
        Text(
            title,
            color = Color.White,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f),
        )
    }
}
