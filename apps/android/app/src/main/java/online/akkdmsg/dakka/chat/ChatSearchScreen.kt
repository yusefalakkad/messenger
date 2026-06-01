package online.akkdmsg.dakka.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import online.akkdmsg.dakka.data.Message
import online.akkdmsg.dakka.data.api.ChatActions
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.theme.DakkaColor

/**
 * Полно-экранный оверлей поиска внутри чата.
 * Дебаунс 280 мс, бэкэнд — /chats/:id/messages/search.
 *
 * onResultClick(messageId) — навигация к найденному сообщению.
 */
@Composable
fun ChatSearchScreen(
    chatId: String,
    onClose: () -> Unit,
    onResultClick: (String) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Message>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }

    LaunchedEffect(query) {
        delay(280)
        val q = query.trim()
        if (q.isEmpty()) {
            results = emptyList()
            return@LaunchedEffect
        }
        loading = true
        results = runCatching { ChatActions.search(chatId, q) }.getOrDefault(emptyList())
        loading = false
    }

    Box(Modifier.fillMaxSize().background(Color(0xFF0B0A14))) {
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
                IconButton(onClick = onClose) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        "Закрыть",
                        tint = Color.White.copy(alpha = 0.85f),
                    )
                }
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.04f))
                        .border(1.dp, Color.White.copy(alpha = 0.07f), CircleShape)
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        Icons.Filled.Search, null,
                        tint = Color.White.copy(alpha = 0.4f),
                        modifier = Modifier.size(16.dp),
                    )
                    Box(Modifier.weight(1f)) {
                        BasicTextField(
                            value = query,
                            onValueChange = { query = it },
                            singleLine = true,
                            cursorBrush = SolidColor(DakkaColor.Violet),
                            textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.White),
                        )
                        if (query.isEmpty()) {
                            Text(
                                "Поиск в чате…",
                                color = Color.White.copy(alpha = 0.3f),
                                style = MaterialTheme.typography.bodyLarge,
                            )
                        }
                    }
                    if (loading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(14.dp),
                            color = DakkaColor.Violet,
                            strokeWidth = 2.dp,
                        )
                    }
                }
            }

            // Results
            if (query.isBlank()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        "Начните вводить запрос",
                        color = Color.White.copy(alpha = 0.4f),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            } else if (!loading && results.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        "Ничего не найдено",
                        color = Color.White.copy(alpha = 0.4f),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    items(results, key = { it.id }) { msg ->
                        SearchResultRow(message = msg, query = query) {
                            onResultClick(msg.id)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchResultRow(message: Message, query: String, onClick: () -> Unit) {
    val preview = when (message.type) {
        "voice"  -> "🎙 Голосовое"
        "image"  -> "📷 Фото"
        "circle" -> "⭕ Видео-кружок"
        "file"   -> "📎 Файл"
        else     -> message.content?.takeIf { it.isNotBlank() } ?: "Сообщение"
    }
    val timeStr = remember(message.createdAt) {
        runCatching {
            val t = java.time.OffsetDateTime.parse(message.createdAt)
            "%02d.%02d %02d:%02d".format(t.dayOfMonth, t.monthValue, t.hour, t.minute)
        }.getOrDefault("")
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White.copy(alpha = 0.04f))
            .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(14.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = message.sender?.displayName ?: "—",
                color = DakkaColor.Violet,
                style = MaterialTheme.typography.labelMedium,
            )
            Text(
                text = preview,
                color = Color.White,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
            )
        }
        Text(
            text = timeStr,
            color = Color.White.copy(alpha = 0.4f),
            style = MaterialTheme.typography.labelSmall,
        )
    }
    Spacer(Modifier.size(6.dp))
}
