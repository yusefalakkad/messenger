package online.akkdmsg.dakka.chats

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Unarchive
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.displayName
import online.akkdmsg.dakka.ui.theme.DakkaColor
import java.time.Instant

/**
 * Bottom-sheet быстрых действий над чатом из списка.
 * Стиль соответствует [online.akkdmsg.dakka.chat.MessageContextMenu].
 *
 * @param archivedMode true — показываем только "Разархивировать" (для экрана архива).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatRowContextMenu(
    chat: Chat,
    currentUserId: String?,
    archivedMode: Boolean = false,
    onDismiss: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleArchive: () -> Unit,
    onMute: (until: String?) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var muteOpen by remember { mutableStateOf(false) }

    val isPinned = chat.pinnedAt != null
    val isArchived = chat.archivedAt != null
    val isMuted = remember(chat.mutedUntil) { isCurrentlyMuted(chat.mutedUntil) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = DakkaColor.Surface,
        dragHandle = null,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = chat.displayName(currentUserId),
                color = Color.White,
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
            )

            if (archivedMode) {
                ActionItem(Icons.Filled.Unarchive, "Разархивировать") {
                    onToggleArchive(); onDismiss()
                }
            } else {
                ActionItem(
                    Icons.Filled.PushPin,
                    if (isPinned) "Открепить" else "Закрепить",
                ) { onTogglePin(); onDismiss() }

                ActionItem(
                    if (isArchived) Icons.Filled.Unarchive else Icons.Filled.Archive,
                    if (isArchived) "Разархивировать" else "Архивировать",
                ) { onToggleArchive(); onDismiss() }

                if (muteOpen) {
                    MuteOptions(
                        onPick = { until -> onMute(until); onDismiss() },
                    )
                } else {
                    ActionItem(
                        if (isMuted) Icons.Filled.NotificationsActive else Icons.Filled.NotificationsOff,
                        if (isMuted) "Включить звук" else "Звук",
                    ) {
                        if (isMuted) { onMute(null); onDismiss() }
                        else muteOpen = true
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
private fun MuteOptions(onPick: (String?) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "Заглушить на…",
            color = Color.White.copy(alpha = 0.65f),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 8.dp),
        )
        ActionItem(Icons.Filled.NotificationsOff, "1 час") {
            onPick(java.time.OffsetDateTime.now().plusHours(1).toString())
        }
        ActionItem(Icons.Filled.NotificationsOff, "8 часов") {
            onPick(java.time.OffsetDateTime.now().plusHours(8).toString())
        }
        ActionItem(Icons.Filled.NotificationsOff, "До завтра") {
            // 8:00 утра следующего дня в локальной зоне
            val tomorrow = java.time.LocalDate.now().plusDays(1).atTime(8, 0)
                .atZone(java.time.ZoneId.systemDefault()).toOffsetDateTime()
            onPick(tomorrow.toString())
        }
        ActionItem(Icons.Filled.NotificationsOff, "Навсегда") {
            onPick("forever")
        }
    }
}

@Composable
private fun ActionItem(
    icon: ImageVector,
    label: String,
    danger: Boolean = false,
    onClick: () -> Unit,
) {
    val color = if (danger) DakkaColor.DangerSoft else Color.White
    Row(
        Modifier
            .fillMaxWidth()
            .background(Color.White.copy(alpha = 0.03f), RoundedCornerShape(12.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = color, modifier = Modifier.size(20.dp))
        Text(label, color = color, style = MaterialTheme.typography.bodyLarge)
    }
}

/** Заглушка действует если mutedUntil парсится как Instant и > сейчас, либо "forever". */
internal fun isCurrentlyMuted(mutedUntil: String?): Boolean {
    if (mutedUntil.isNullOrBlank()) return false
    if (mutedUntil == "forever") return true
    return runCatching {
        Instant.parse(mutedUntil).isAfter(Instant.now())
    }.getOrElse {
        // Fallback: попробуем OffsetDateTime → Instant.
        runCatching {
            java.time.OffsetDateTime.parse(mutedUntil).toInstant().isAfter(Instant.now())
        }.getOrDefault(false)
    }
}
