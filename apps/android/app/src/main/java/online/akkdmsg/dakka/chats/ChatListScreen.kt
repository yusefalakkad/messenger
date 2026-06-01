package online.akkdmsg.dakka.chats

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import online.akkdmsg.dakka.auth.AuthStore
import online.akkdmsg.dakka.data.api.SocketClient
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor

/**
 * Заглушка списка чатов. Полная реализация со списком, WebSocket'ом, навигацией
 * в чат — в следующих сессиях (зеркалит iOS).
 */
@Composable
fun ChatListScreen() {
    val context = LocalContext.current
    val auth = remember { AuthStore.get(context) }
    val user by auth.user.collectAsState()
    val socketConnected by SocketClient.connected.collectAsState()

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()

        Column(
            Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Привет, ${user?.displayName ?: "—"}",
                        color = Color.White,
                        style = MaterialTheme.typography.headlineMedium,
                    )
                    Text(
                        text = "@${user?.username ?: ""}",
                        color = Color.White.copy(alpha = 0.5f),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                IconButton(onClick = { auth.logout() }) {
                    Icon(Icons.Filled.Logout, contentDescription = "Logout", tint = Color.White.copy(alpha = 0.7f))
                }
            }

            // Заглушка карточки
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color.White.copy(alpha = 0.04f))
                    .padding(24.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Список чатов — в следующей сессии",
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = "Аналогично iOS: реактивный StateFlow, поиск, pull-to-refresh, swipe-to-archive.",
                        color = Color.White.copy(alpha = 0.55f),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Row(
                        Modifier.padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(Brand.gradient)
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                        ) {
                            Text("Auth ✓", color = Color.White, style = MaterialTheme.typography.bodySmall)
                        }
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (socketConnected) DakkaColor.Online.copy(alpha = 0.2f) else Color.White.copy(alpha = 0.08f))
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                        ) {
                            Text(
                                if (socketConnected) "WebSocket ●" else "WebSocket …",
                                color = if (socketConnected) DakkaColor.Online else Color.White.copy(alpha = 0.5f),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
        }
    }
}
