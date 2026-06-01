package online.akkdmsg.dakka.chats

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Group
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
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.User
import online.akkdmsg.dakka.data.api.ChatActions
import online.akkdmsg.dakka.data.api.UserApi
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.Avatar
import online.akkdmsg.dakka.ui.components.BrandButton
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun NewGroupScreen(
    onBack: () -> Unit,
    onCreated: (Chat) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<User>>(emptyList()) }
    var selected by remember { mutableStateOf<List<User>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var creating by remember { mutableStateOf(false) }

    LaunchedEffect(query) {
        delay(250)
        val q = query.trim()
        if (q.isEmpty()) { results = emptyList(); return@LaunchedEffect }
        loading = true
        results = runCatching {
            UserApi.search(q).filterNot { u -> selected.any { it.id == u.id } }
        }.getOrDefault(emptyList())
        loading = false
    }

    val canCreate = name.trim().isNotEmpty() && selected.isNotEmpty() && !creating

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()
        Column(Modifier.fillMaxSize().padding(top = 28.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад", tint = Color.White.copy(alpha = 0.85f))
                }
                Row(verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Filled.Group, null, tint = DakkaColor.Violet, modifier = Modifier.size(18.dp))
                    Text("Новая группа", color = Color.White, style = MaterialTheme.typography.titleMedium)
                }
            }

            // Group name
            Row(
                Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(DakkaColor.Input)
                    .border(1.dp, Color.White.copy(alpha = 0.07f), RoundedCornerShape(12.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Box(Modifier.weight(1f)) {
                    BasicTextField(
                        value = name, onValueChange = { name = it }, singleLine = true,
                        cursorBrush = SolidColor(DakkaColor.Violet),
                        textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.White),
                    )
                    if (name.isEmpty()) Text("Название группы…",
                        color = Color.White.copy(alpha = 0.3f), style = MaterialTheme.typography.bodyLarge)
                }
            }

            // Selected chips
            if (selected.isNotEmpty()) {
                LazyRow(
                    Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(selected, key = { it.id }) { u ->
                        Row(
                            Modifier
                                .clip(CircleShape)
                                .background(DakkaColor.Violet.copy(alpha = 0.18f))
                                .border(1.dp, DakkaColor.Violet.copy(alpha = 0.4f), CircleShape)
                                .padding(start = 4.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Avatar(url = u.avatar, name = u.displayName, size = 22)
                            Text(u.displayName, color = Color.White.copy(alpha = 0.9f),
                                style = MaterialTheme.typography.bodySmall)
                            IconButton(
                                onClick = { selected = selected - u },
                                modifier = Modifier.size(18.dp),
                            ) {
                                Icon(Icons.Filled.Close, "remove",
                                    tint = Color.White.copy(alpha = 0.7f),
                                    modifier = Modifier.size(12.dp))
                            }
                        }
                    }
                }
            }

            // Search
            Row(
                Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth()
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.04f))
                    .border(1.dp, Color.White.copy(alpha = 0.07f), CircleShape)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.Search, null, tint = Color.White.copy(alpha = 0.4f), modifier = Modifier.size(16.dp))
                Box(Modifier.weight(1f)) {
                    BasicTextField(
                        value = query, onValueChange = { query = it }, singleLine = true,
                        cursorBrush = SolidColor(DakkaColor.Violet),
                        textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.White),
                    )
                    if (query.isEmpty()) Text("Добавить участников…",
                        color = Color.White.copy(alpha = 0.3f), style = MaterialTheme.typography.bodyLarge)
                }
                if (loading) CircularProgressIndicator(
                    modifier = Modifier.size(14.dp), color = DakkaColor.Violet, strokeWidth = 2.dp)
            }

            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    query.isEmpty() && selected.isEmpty() -> EmptyHint(
                        "Найди и добавь участников", "Минимум один человек чтобы создать группу")
                    query.isNotEmpty() && results.isEmpty() && !loading -> EmptyHint(
                        "Никого не нашлось", "Попробуй другое имя")
                    else -> LazyColumn(Modifier.padding(horizontal = 12.dp)) {
                        items(results, key = { it.id }) { u ->
                            UserRow(user = u, onClick = {
                                selected = selected + u
                                results = results.filterNot { it.id == u.id }
                            })
                        }
                    }
                }
            }

            BrandButton(
                text = if (selected.isEmpty()) "Создать группу" else "Создать · ${selected.size} участн.",
                isLoading = creating,
                enabled = canCreate,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                onClick = {
                    creating = true
                    scope.launch {
                        runCatching { ChatActions.createGroup(name.trim(), selected.map { it.id }) }
                            .onSuccess { onCreated(it) }
                        creating = false
                    }
                },
            )
        }
    }
}
