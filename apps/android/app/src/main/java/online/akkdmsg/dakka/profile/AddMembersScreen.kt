package online.akkdmsg.dakka.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
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
import kotlinx.coroutines.launch
import online.akkdmsg.dakka.chats.UserRow
import online.akkdmsg.dakka.data.User
import online.akkdmsg.dakka.data.api.ChatActions
import online.akkdmsg.dakka.data.api.UserApi
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.BrandButton
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun AddMembersScreen(
    chatId: String,
    existingMemberIds: Set<String>,
    onBack: () -> Unit,
    onDone: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<User>>(emptyList()) }
    var selected by remember { mutableStateOf<List<User>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var adding by remember { mutableStateOf(false) }

    LaunchedEffect(query) {
        delay(250)
        val q = query.trim()
        if (q.isEmpty()) { results = emptyList(); return@LaunchedEffect }
        loading = true
        results = runCatching {
            UserApi.search(q).filterNot { existingMemberIds.contains(it.id) }
        }.getOrDefault(emptyList())
        loading = false
    }

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()
        Column(Modifier.fillMaxSize().padding(top = 28.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад",
                        tint = Color.White.copy(alpha = 0.85f))
                }
                Text("Добавить участников", color = Color.White,
                    style = MaterialTheme.typography.titleMedium)
            }

            Row(
                Modifier.padding(horizontal = 16.dp, vertical = 12.dp).fillMaxWidth()
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.04f))
                    .border(1.dp, Color.White.copy(alpha = 0.07f), CircleShape)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.Search, null, tint = Color.White.copy(alpha = 0.4f),
                    modifier = Modifier.size(16.dp))
                Box(Modifier.weight(1f)) {
                    BasicTextField(
                        value = query, onValueChange = { query = it }, singleLine = true,
                        cursorBrush = SolidColor(DakkaColor.Violet),
                        textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.White),
                    )
                    if (query.isEmpty()) Text("Поиск пользователей…",
                        color = Color.White.copy(alpha = 0.3f),
                        style = MaterialTheme.typography.bodyLarge)
                }
                if (loading) CircularProgressIndicator(
                    modifier = Modifier.size(14.dp), color = DakkaColor.Violet, strokeWidth = 2.dp)
            }

            LazyColumn(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                items(results, key = { it.id }) { u ->
                    val isSel = selected.any { it.id == u.id }
                    UserRow(user = u, selected = isSel) {
                        selected = if (isSel) selected.filterNot { it.id == u.id }
                                   else selected + u
                    }
                }
            }

            BrandButton(
                text = if (selected.isEmpty()) "Добавить" else "Добавить · ${selected.size}",
                isLoading = adding,
                enabled = selected.isNotEmpty() && !adding,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                onClick = {
                    adding = true
                    scope.launch {
                        runCatching { ChatActions.addGroupMembers(chatId, selected.map { it.id }) }
                            .onSuccess { onDone() }
                        adding = false
                    }
                },
            )
        }
    }
}
