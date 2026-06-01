package online.akkdmsg.dakka.chats

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.displayAvatar
import online.akkdmsg.dakka.data.displayName
import online.akkdmsg.dakka.data.isOnline
import online.akkdmsg.dakka.ui.components.Avatar
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ChatListRow(
    chat: Chat,
    currentUserId: String?,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val lastMsg = chat.lastMessage
    val preview = remember(lastMsg) {
        when (lastMsg?.type) {
            "text"   -> if (lastMsg.encrypted == true) "🔒 Зашифрованное сообщение" else lastMsg.content.orEmpty()
            "voice"  -> "🎤 Голосовое"
            "image"  -> "📷 Фото"
            "video"  -> "🎬 Видео"
            "circle" -> "⭕ Видео-кружок"
            "file"   -> "📎 Файл"
            null     -> ""
            else     -> ""
        }
    }
    val online = chat.isOnline(currentUserId).takeIf { chat.type == "direct" }
    val isPinned = chat.pinnedAt != null
    val isMuted = remember(chat.mutedUntil) { isCurrentlyMuted(chat.mutedUntil) }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .combinedClickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
                onLongClick = onLongClick,
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(
            url = chat.displayAvatar(currentUserId),
            name = chat.displayName(currentUserId),
            size = 48,
            online = online,
        )

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = chat.displayName(currentUserId),
                    color = Color.White,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (isMuted) {
                    Spacer(Modifier.size(4.dp))
                    Icon(
                        Icons.Filled.NotificationsOff,
                        contentDescription = "Без звука",
                        tint = Color.White.copy(alpha = 0.5f),
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
            if (preview.isNotEmpty()) {
                Text(
                    text = preview,
                    color = Color.White.copy(alpha = 0.55f),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        Column(
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (isPinned) {
                Icon(
                    Icons.Filled.PushPin,
                    contentDescription = "Закреплено",
                    tint = DakkaColor.Violet,
                    modifier = Modifier.size(14.dp),
                )
            }
            if (chat.unreadCount > 0) {
                Box(
                    Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(Brand.gradient),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (chat.unreadCount > 99) "99+" else chat.unreadCount.toString(),
                        color = Color.White,
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
        }
    }
}
