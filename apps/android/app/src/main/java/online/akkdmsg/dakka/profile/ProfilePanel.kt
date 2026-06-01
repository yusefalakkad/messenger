package online.akkdmsg.dakka.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PersonAddAlt
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.RemoveCircle
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import online.akkdmsg.dakka.auth.AuthStore
import online.akkdmsg.dakka.call.CallManager
import online.akkdmsg.dakka.call.CallType
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.data.ChatMember
import online.akkdmsg.dakka.data.api.ChatActions
import online.akkdmsg.dakka.data.displayName
import online.akkdmsg.dakka.data.displayAvatar
import online.akkdmsg.dakka.data.isE2E
import online.akkdmsg.dakka.data.isOnline
import online.akkdmsg.dakka.data.otherMember
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.Avatar
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun ProfilePanel(
    chat: Chat,
    onBack: () -> Unit,
    onAddMembers: () -> Unit,
    onChatCleared: () -> Unit,
    onLeftChat: () -> Unit,
) {
    val context = LocalContext.current
    val auth = remember { AuthStore.get(context) }
    val me by auth.user.collectAsState()
    val scope = rememberCoroutineScope()

    var isMuted by remember { mutableStateOf(false) } // TODO: derive from chat.members
    var processingMute by remember { mutableStateOf(false) }
    var confirmClear by remember { mutableStateOf(false) }
    var confirmLeave by remember { mutableStateOf(false) }
    var pendingKick by remember { mutableStateOf<ChatMember?>(null) }
    var renameOpen by remember { mutableStateOf(false) }
    var renameDraft by remember { mutableStateOf(chat.name.orEmpty()) }

    val myRole = chat.members.firstOrNull { it.userId == me?.id }?.role
    val canManage = myRole == "owner" || myRole == "admin"

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()

        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 28.dp)) {
            // Header
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад",
                        tint = Color.White.copy(alpha = 0.85f))
                }
                Text("Профиль", color = Color.White, style = MaterialTheme.typography.titleMedium)
            }

            // Hero
            Column(
                Modifier.fillMaxWidth().padding(vertical = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Avatar(
                    url = chat.displayAvatar(me?.id),
                    name = chat.displayName(me?.id),
                    size = 130,
                )
                Text(
                    chat.displayName(me?.id),
                    color = Color.White,
                    style = MaterialTheme.typography.headlineLarge,
                )
                val sub = if (chat.type == "direct") {
                    val other = chat.otherMember(me?.id)
                    if (chat.isOnline(me?.id)) "в сети"
                    else "@${other?.user?.username ?: ""}"
                } else "${chat.members.size} участн."
                Text(sub, color = Color.White.copy(alpha = 0.55f), style = MaterialTheme.typography.bodyMedium)

                if (chat.isE2E) {
                    Row(
                        Modifier
                            .clip(CircleShape)
                            .background(DakkaColor.Violet.copy(alpha = 0.12f))
                            .border(1.dp, DakkaColor.Violet.copy(alpha = 0.4f), CircleShape)
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.Shield, null, tint = DakkaColor.Violet, modifier = Modifier.size(12.dp))
                        Text("Сквозное шифрование", color = DakkaColor.Violet,
                            style = MaterialTheme.typography.labelSmall)
                    }
                }
            }

            // Direct: call actions
            if (chat.type == "direct") {
                val other = chat.otherMember(me?.id)
                Row(
                    Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    ActionTile(Icons.Filled.Phone, "Аудио", Modifier.weight(1f)) {
                        other?.let { CallManager.startCall(it, chat.id, CallType.Audio); onBack() }
                    }
                    ActionTile(Icons.Filled.Videocam, "Видео", Modifier.weight(1f)) {
                        other?.let { CallManager.startCall(it, chat.id, CallType.Video); onBack() }
                    }
                }
            }

            // Group: members + admin actions
            if (chat.type == "group") {
                Row(
                    Modifier.padding(horizontal = 20.dp, vertical = 12.dp).fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "${chat.members.size} УЧАСТН.",
                        color = Color.White.copy(alpha = 0.5f),
                        style = MaterialTheme.typography.labelSmall,
                    )
                    if (canManage) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            CircleAdminBtn(Icons.Filled.Edit) {
                                renameDraft = chat.name.orEmpty()
                                renameOpen = true
                            }
                            CircleAdminBtn(Icons.Filled.PersonAddAlt, onAddMembers)
                        }
                    }
                }
                Column(Modifier.padding(horizontal = 12.dp).fillMaxWidth()) {
                    chat.members.forEach { member ->
                        val isMe = member.userId == me?.id
                        val canKick = canManage && !isMe && member.role != "owner"
                        MemberRow(member, isMe = isMe, canKick = canKick,
                            onKick = { pendingKick = member })
                    }
                }
            }

            // Common: mute + clear (+ leave для group)
            Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
                ActionRow(
                    icon = if (isMuted) Icons.Filled.NotificationsOff else Icons.Filled.Notifications,
                    label = "Заглушить уведомления",
                    sublabel = if (isMuted) "Push не приходят" else null,
                    onClick = {
                        if (processingMute) return@ActionRow
                        processingMute = true
                        val until = if (!isMuted) // на 100 лет
                            java.time.OffsetDateTime.now().plusYears(100).toString()
                        else null
                        scope.launch {
                            runCatching { ChatActions.setMute(chat.id, until) }
                                .onSuccess { isMuted = !isMuted }
                            processingMute = false
                        }
                    },
                )
                Spacer(Modifier.height(8.dp))
                ActionRow(
                    icon = Icons.Filled.Delete,
                    label = "Очистить историю",
                    danger = true,
                    onClick = { confirmClear = true },
                )
                if (chat.type == "group") {
                    Spacer(Modifier.height(8.dp))
                    ActionRow(
                        icon = Icons.Filled.ExitToApp,
                        label = "Покинуть группу",
                        danger = true,
                        onClick = { confirmLeave = true },
                    )
                }
            }

            Spacer(Modifier.height(40.dp))
        }

        // Dialogs
        if (confirmClear) ConfirmDialog(
            title = "Очистить всю историю?",
            message = "Сообщения будут удалены навсегда. Эта операция необратима.",
            confirmText = "Очистить",
            danger = true,
            onConfirm = {
                confirmClear = false
                scope.launch {
                    if (ChatActions.clearMessages(chat.id)) onChatCleared()
                }
            },
            onDismiss = { confirmClear = false },
        )
        if (confirmLeave) ConfirmDialog(
            title = "Покинуть группу?",
            message = "Ты больше не будешь видеть сообщения этой группы.",
            confirmText = "Покинуть", danger = true,
            onConfirm = {
                confirmLeave = false
                scope.launch {
                    me?.id?.let { id ->
                        if (ChatActions.removeMember(chat.id, id)) onLeftChat()
                    }
                }
            },
            onDismiss = { confirmLeave = false },
        )
        pendingKick?.let { member ->
            ConfirmDialog(
                title = "Удалить участника?",
                message = "Убрать ${member.user.displayName} из группы?",
                confirmText = "Удалить", danger = true,
                onConfirm = {
                    val toKick = member
                    pendingKick = null
                    scope.launch { ChatActions.removeMember(chat.id, toKick.userId) }
                },
                onDismiss = { pendingKick = null },
            )
        }
        if (renameOpen) RenameDialog(
            initial = renameDraft,
            onConfirm = { newName ->
                renameOpen = false
                scope.launch { runCatching { ChatActions.renameGroup(chat.id, newName) } }
            },
            onDismiss = { renameOpen = false },
        )
    }
}

@Composable
private fun ActionTile(icon: ImageVector, label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier
            .clip(RoundedCornerShape(18.dp))
            .background(Color.White.copy(alpha = 0.03f))
            .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(18.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier.size(52.dp).clip(CircleShape).background(Brand.gradient),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = Color.White, modifier = Modifier.size(22.dp)) }
        Text(label, color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun ActionRow(
    icon: ImageVector,
    label: String,
    sublabel: String? = null,
    danger: Boolean = false,
    onClick: () -> Unit,
) {
    val color = if (danger) DakkaColor.DangerSoft else Color.White
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (danger) DakkaColor.Danger.copy(alpha = 0.08f) else Color.White.copy(alpha = 0.03f))
            .border(
                1.dp,
                if (danger) DakkaColor.Danger.copy(alpha = 0.2f) else Color.White.copy(alpha = 0.05f),
                RoundedCornerShape(14.dp),
            )
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(28.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(
                    if (danger) DakkaColor.Danger.copy(alpha = 0.15f)
                    else DakkaColor.Violet.copy(alpha = 0.15f)
                ),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = if (danger) DakkaColor.DangerSoft else DakkaColor.Violet,
                modifier = Modifier.size(14.dp)) }
        Column(Modifier.weight(1f)) {
            Text(label, color = color, style = MaterialTheme.typography.bodyLarge)
            if (sublabel != null) {
                Text(sublabel, color = Color.White.copy(alpha = 0.45f),
                    style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun CircleAdminBtn(icon: ImageVector, onClick: () -> Unit) {
    Box(
        Modifier.size(32.dp).clip(CircleShape)
            .background(DakkaColor.Violet.copy(alpha = 0.15f))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = DakkaColor.Violet, modifier = Modifier.size(14.dp)) }
}

@Composable
private fun MemberRow(member: ChatMember, isMe: Boolean, canKick: Boolean, onKick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.03f))
            .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(
            url = member.user.avatar, name = member.user.displayName, size = 38,
            online = member.user.status == "online",
        )
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(member.user.displayName, color = Color.White,
                    style = MaterialTheme.typography.bodyMedium)
                if (isMe) Text("(вы)", color = Color.White.copy(alpha = 0.4f),
                    style = MaterialTheme.typography.bodySmall)
            }
            val role = member.role
            if (role != null && role != "member") {
                Text(role.uppercase(), color = DakkaColor.Violet,
                    style = MaterialTheme.typography.labelSmall)
            } else {
                Text("@${member.user.username}", color = Color.White.copy(alpha = 0.45f),
                    style = MaterialTheme.typography.bodySmall)
            }
        }
        if (canKick) {
            IconButton(onClick = onKick, modifier = Modifier.size(28.dp)) {
                Icon(Icons.Filled.RemoveCircle, "kick",
                    tint = DakkaColor.Danger.copy(alpha = 0.85f),
                    modifier = Modifier.size(20.dp))
            }
        }
    }
    Spacer(Modifier.height(6.dp))
}

@Composable
private fun ConfirmDialog(
    title: String,
    message: String,
    confirmText: String,
    danger: Boolean = false,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(confirmText,
                    color = if (danger) DakkaColor.DangerSoft else DakkaColor.Violet)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Отмена", color = Color.White.copy(alpha = 0.6f)) }
        },
        containerColor = DakkaColor.Card,
        titleContentColor = Color.White,
        textContentColor = Color.White.copy(alpha = 0.75f),
    )
}

@Composable
private fun RenameDialog(
    initial: String, onConfirm: (String) -> Unit, onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Переименовать группу") },
        text = {
            Row(
                Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(DakkaColor.Input)
                    .border(1.dp, Color.White.copy(alpha = 0.07f), RoundedCornerShape(10.dp))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
            ) {
                androidx.compose.foundation.text.BasicTextField(
                    value = name, onValueChange = { name = it }, singleLine = true,
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(DakkaColor.Violet),
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.White),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(name.trim()) },
                enabled = name.trim().isNotEmpty() && name.trim() != initial,
            ) { Text("Сохранить", color = DakkaColor.Violet) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Отмена", color = Color.White.copy(alpha = 0.6f)) }
        },
        containerColor = DakkaColor.Card,
        titleContentColor = Color.White,
    )
}
