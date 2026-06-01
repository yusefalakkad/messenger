package online.akkdmsg.dakka.chats

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
import androidx.compose.material.icons.filled.Shield
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
import kotlinx.coroutines.launch
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.User
import online.akkdmsg.dakka.data.api.ChatActions
import online.akkdmsg.dakka.data.api.UserApi
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.Avatar
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun NewChatScreen(
    onBack: () -> Unit,
    onChatCreated: (Chat) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<User>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var creatingFor by remember { mutableStateOf<String?>(null) }

    // Дебаунс 250мс
    LaunchedEffect(query) {
        delay(250)
        val q = query.trim()
        if (q.isEmpty()) { results = emptyList(); return@LaunchedEffect }
        loading = true
        results = runCatching { UserApi.search(q) }.getOrDefault(emptyList())
        loading = false
    }

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()
        Column(Modifier.fillMaxSize().padding(top = 28.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад", tint = Color.White.copy(alpha = 0.85f))
                }
                Text("Новый чат", color = Color.White, style = MaterialTheme.typography.titleMedium)
            }

            // Search
            Row(
                Modifier
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .fillMaxWidth()
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.04f))
                    .border(1.dp, Color.White.copy(alpha = 0.07f), CircleShape)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Search, null, tint = Color.White.copy(alpha = 0.4f), modifier = Modifier.size(16.dp))
                Box(Modifier.weight(1f)) {
                    BasicTextField(
                        value = query,
                        onValueChange = { query = it },
                        singleLine = true,
                        cursorBrush = SolidColor(DakkaColor.Violet),
                        textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.White),
                    )
                    if (query.isEmpty()) {
                        Text("Поиск по @username…", color = Color.White.copy(alpha = 0.3f),
                            style = MaterialTheme.typography.bodyLarge)
                    }
                }
                if (loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(14.dp),
                        color = DakkaColor.Violet, strokeWidth = 2.dp,
                    )
                }
            }

            when {
                query.isEmpty() -> EmptyHint("Найди собеседника", "Введи @username или часть имени")
                results.isEmpty() && !loading -> EmptyHint("Никого не нашлось", "Попробуй другое имя")
                else -> LazyColumn(
                    Modifier.fillMaxSize().padding(horizontal = 12.dp),
                    contentPadding = PaddingValues(bottom = 24.dp),
                ) {
                    items(results, key = { it.id }) { user ->
                        UserRow(
                            user = user,
                            loading = creatingFor == user.id,
                            onClick = {
                                if (creatingFor != null) return@UserRow
                                creatingFor = user.id
                                scope.launch {
                                    runCatching { ChatActions.createDirect(user.id) }
                                        .onSuccess { onChatCreated(it) }
                                        .onFailure { creatingFor = null }
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
internal fun UserRow(
    user: User,
    loading: Boolean = false,
    selected: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) DakkaColor.Violet.copy(alpha = 0.1f) else Color.Transparent)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(url = user.avatar, name = user.displayName, size = 42, online = user.status == "online")
        Column(Modifier.weight(1f)) {
            Text(user.displayName, color = Color.White, style = MaterialTheme.typography.bodyMedium)
            Text("@${user.username}", color = Color.White.copy(alpha = 0.45f), style = MaterialTheme.typography.bodySmall)
        }
        when {
            loading -> CircularProgressIndicator(
                modifier = Modifier.size(18.dp), color = DakkaColor.Violet, strokeWidth = 2.dp)
            !user.publicKey.isNullOrBlank() -> Icon(
                Icons.Filled.Shield, null,
                tint = DakkaColor.Violet, modifier = Modifier.size(14.dp))
        }
    }
}

@Composable
internal fun EmptyHint(title: String, subtitle: String) {
    Column(
        Modifier.fillMaxSize().padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, color = Color.White, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(4.dp))
        Text(subtitle, color = Color.White.copy(alpha = 0.45f), style = MaterialTheme.typography.bodySmall)
    }
}
