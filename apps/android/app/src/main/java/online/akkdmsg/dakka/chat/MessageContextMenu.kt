package online.akkdmsg.dakka.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import online.akkdmsg.dakka.data.Message
import online.akkdmsg.dakka.ui.theme.DakkaColor

/**
 * Bottom-sheet с быстрыми эмодзи и действиями над сообщением.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessageContextMenu(
    message: Message,
    isOwn: Boolean,
    onDismiss: () -> Unit,
    onReact: (String) -> Unit,
    onReply: () -> Unit,
    onEdit: () -> Unit,
    onCopy: () -> Unit,
    onForward: () -> Unit,
    onDelete: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

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
            ReactionPicker(
                onPick = { e -> onReact(e); onDismiss() },
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )

            ActionItem(Icons.AutoMirrored.Filled.Reply, "Ответить") { onReply(); onDismiss() }
            if (message.type == "text") {
                ActionItem(Icons.Filled.ContentCopy, "Копировать") { onCopy(); onDismiss() }
            }
            ActionItem(Icons.AutoMirrored.Filled.Send, "Переслать") { onForward(); onDismiss() }
            if (isOwn && message.type == "text") {
                ActionItem(Icons.Filled.Edit, "Редактировать") { onEdit(); onDismiss() }
            }
            if (isOwn) {
                ActionItem(Icons.Filled.Delete, "Удалить", danger = true) { onDelete(); onDismiss() }
            }
            Spacer(Modifier.height(12.dp))
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
