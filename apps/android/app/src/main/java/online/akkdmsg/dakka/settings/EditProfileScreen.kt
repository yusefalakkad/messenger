package online.akkdmsg.dakka.settings

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Camera
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import online.akkdmsg.dakka.auth.AuthStore
import online.akkdmsg.dakka.data.User
import online.akkdmsg.dakka.data.api.ApiClient
import online.akkdmsg.dakka.data.api.MediaService
import online.akkdmsg.dakka.media.ImagePreparer
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.Avatar
import online.akkdmsg.dakka.ui.components.BrandButton
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun EditProfileScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val auth = remember { AuthStore.get(context) }
    val user by auth.user.collectAsState()
    val scope = rememberCoroutineScope()

    var displayName by remember { mutableStateOf(user?.displayName.orEmpty()) }
    var newAvatarUrl by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val photoLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            saving = true
            try {
                val prepared = ImagePreparer.fromUri(context, uri) ?: return@launch
                val media = MediaService.uploadImage(prepared.file, prepared.mimeType, prepared.fileName)
                newAvatarUrl = media.url
                prepared.file.delete()
            } catch (e: Exception) {
                error = e.message
            } finally {
                saving = false
            }
        }
    }

    val canSave = displayName.isNotBlank() &&
        (displayName.trim() != user?.displayName || newAvatarUrl != null)

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()

        Column(
            Modifier.fillMaxSize().padding(top = 28.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            // Header
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад", tint = Color.White.copy(alpha = 0.85f))
                }
                Text("Профиль", color = Color.White, style = MaterialTheme.typography.titleMedium)
            }

            // Avatar picker
            Box(
                Modifier.fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier
                        .size(120.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) {
                            photoLauncher.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                            )
                        },
                    contentAlignment = Alignment.BottomEnd,
                ) {
                    Avatar(
                        url = newAvatarUrl ?: user?.avatar,
                        name = user?.displayName ?: "?",
                        size = 110,
                    )
                    Box(
                        Modifier
                            .size(36.dp)
                            .shadow(8.dp, CircleShape, ambientColor = DakkaColor.Violet, spotColor = DakkaColor.Violet)
                            .clip(CircleShape)
                            .background(Brand.gradient),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Camera, null, tint = Color.White, modifier = Modifier.size(16.dp))
                    }
                }
            }

            Text(
                "Тап чтобы сменить фото",
                color = Color.White.copy(alpha = 0.45f),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )

            // Display name
            Column(
                Modifier.padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("Имя", color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.bodySmall)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
                        .background(DakkaColor.Input)
                        .border(1.dp, Color.White.copy(alpha = 0.07f), androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                ) {
                    androidx.compose.foundation.text.BasicTextField(
                        value = displayName,
                        onValueChange = { displayName = it },
                        singleLine = true,
                        cursorBrush = androidx.compose.ui.graphics.SolidColor(DakkaColor.Violet),
                        textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.White),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            if (error != null) {
                Text(
                    text = error.orEmpty(),
                    color = DakkaColor.DangerSoft,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }

            BrandButton(
                text = "Сохранить",
                isLoading = saving,
                enabled = canSave,
                modifier = Modifier.padding(horizontal = 16.dp),
                onClick = {
                    scope.launch {
                        saving = true
                        try {
                            val updated = updateProfile(displayName.trim(), newAvatarUrl)
                            updated?.let {
                                val token = ApiClient.accessToken ?: return@launch
                                auth.setAuth(it, token)
                            }
                            onBack()
                        } catch (e: Exception) {
                            error = e.message
                        } finally {
                            saving = false
                        }
                    }
                },
            )

            Spacer(Modifier.weight(1f))
        }
    }
}

@Serializable
private data class UpdateProfileRequest(val displayName: String? = null, val avatar: String? = null)

private suspend fun updateProfile(displayName: String?, avatar: String?): User? = try {
    ApiClient.post(
        path = "users/me",
        body = UpdateProfileRequest(displayName, avatar),
    )
} catch (_: Exception) { null }
