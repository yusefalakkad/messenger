package online.akkdmsg.dakka.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import online.akkdmsg.dakka.data.Message
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun MessageBubble(
    message: Message,
    isOwn: Boolean,
    decrypted: String?,
    modifier: Modifier = Modifier,
) {
    val encryptedFailed = message.encrypted == true && decrypted == null
    val timeStr = remember(message.createdAt) {
        // ISO8601 → HH:mm
        runCatching {
            val t = java.time.OffsetDateTime.parse(message.createdAt)
            "%02d:%02d".format(t.hour, t.minute)
        }.getOrDefault("")
    }

    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = if (isOwn) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier
                .padding(start = if (isOwn) 64.dp else 0.dp, end = if (isOwn) 0.dp else 64.dp)
                .shadow(
                    elevation = if (isOwn) 12.dp else 6.dp,
                    shape = bubbleShape(isOwn),
                    ambientColor = if (isOwn) DakkaColor.Violet else Color.Black,
                    spotColor = if (isOwn) DakkaColor.Violet else Color.Black,
                )
                .clip(bubbleShape(isOwn))
                .background(if (isOwn) Brand.gradient else null ?: Color.Transparent)
                .then(
                    if (isOwn) Modifier else Modifier
                        .background(Color.White.copy(alpha = 0.04f))
                        .border(1.dp, Color.White.copy(alpha = 0.06f), bubbleShape(isOwn))
                )
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            // Имя отправителя (для группы) — только не своё
            if (!isOwn && message.sender?.displayName != null) {
                Text(
                    text = message.sender.displayName,
                    color = DakkaColor.Violet,
                    style = MaterialTheme.typography.labelSmall,
                )
            }

            // Контент в зависимости от типа сообщения
            when (message.type) {
                "voice" -> message.media?.let { VoicePlayerView(media = it, isOwn = isOwn) }
                "image" -> message.media?.let { ImageMessageView(media = it) }
                else -> {
                    if (encryptedFailed) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(
                                Icons.Filled.Lock, null,
                                tint = Color.White.copy(alpha = 0.45f),
                                modifier = Modifier.size(11.dp),
                            )
                            Text(
                                text = "Не удалось расшифровать",
                                color = Color.White.copy(alpha = 0.45f),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    } else {
                        Text(
                            text = decrypted ?: message.content.orEmpty(),
                            color = Color.White,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
            }

            // Метаданные снизу
            Row(
                modifier = Modifier.align(Alignment.End).padding(top = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (message.encrypted == true) {
                    Icon(
                        Icons.Filled.Lock, null,
                        tint = if (isOwn) Color.White.copy(alpha = 0.7f) else DakkaColor.Violet.copy(alpha = 0.7f),
                        modifier = Modifier.size(9.dp),
                    )
                }
                Text(
                    text = timeStr,
                    color = if (isOwn) Color.White.copy(alpha = 0.7f) else Color.White.copy(alpha = 0.4f),
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
    }
}

private fun bubbleShape(isOwn: Boolean) = RoundedCornerShape(
    topStart = 18.dp,
    topEnd = 18.dp,
    bottomStart = if (isOwn) 18.dp else 4.dp,
    bottomEnd = if (isOwn) 4.dp else 18.dp,
)

