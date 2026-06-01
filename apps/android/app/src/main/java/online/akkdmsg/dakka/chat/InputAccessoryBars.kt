package online.akkdmsg.dakka.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun ReplyBar(preview: String, authorName: String, onCancel: () -> Unit) {
    Bar(icon = Icons.AutoMirrored.Filled.Reply, title = authorName, preview = preview, onCancel = onCancel)
}

@Composable
fun EditBar(preview: String, onCancel: () -> Unit) {
    Bar(icon = Icons.Filled.Edit, title = "Редактирование", preview = preview, onCancel = onCancel)
}

@Composable
private fun Bar(icon: ImageVector, title: String, preview: String, onCancel: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(DakkaColor.Violet.copy(alpha = 0.08f))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = DakkaColor.Violet, modifier = Modifier.size(16.dp))
        Box(
            Modifier
                .width(3.dp)
                .height(34.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(DakkaColor.Violet),
        )
        Column(Modifier.weight(1f)) {
            Text(title, color = DakkaColor.Violet, style = MaterialTheme.typography.labelSmall)
            Text(
                text = preview,
                color = Color.White.copy(alpha = 0.55f),
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Box(
            Modifier
                .size(26.dp)
                .clip(androidx.compose.foundation.shape.CircleShape)
                .background(Color.White.copy(alpha = 0.05f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onCancel,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Close, "Отмена", tint = Color.White.copy(alpha = 0.6f),
                modifier = Modifier.size(14.dp))
        }
    }
}
