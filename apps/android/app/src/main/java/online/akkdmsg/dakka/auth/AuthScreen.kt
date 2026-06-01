package online.akkdmsg.dakka.auth

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import online.akkdmsg.dakka.data.api.AuthApi
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.BrandButton
import online.akkdmsg.dakka.ui.components.BrandTextField
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor
import java.util.UUID

enum class AuthMode(val title: String) { Login("Войти"), Register("Регистрация") }

@Composable
fun AuthScreen() {
    val context = LocalContext.current
    val auth = remember { AuthStore.get(context) }
    val scope = rememberCoroutineScope()

    var mode by remember { mutableStateOf(AuthMode.Login) }

    // Form state
    var login by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            Spacer(Modifier.height(8.dp))

            // Header
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // Лого-плитка с brand-glow
                Box(
                    Modifier
                        .size(96.dp)
                        .shadow(
                            elevation = 28.dp,
                            shape = RoundedCornerShape(24.dp),
                            ambientColor = DakkaColor.Violet,
                            spotColor = DakkaColor.Violet,
                        )
                        .clip(RoundedCornerShape(24.dp))
                        .background(Brand.gradient),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Forum,
                        contentDescription = null,
                        tint = Color.White.copy(alpha = 0.95f),
                        modifier = Modifier.size(48.dp),
                    )
                }

                Text(
                    text = "dakka",
                    style = MaterialTheme.typography.displayLarge.copy(
                        brush = Brand.textGradient,
                    ),
                )
                Text(
                    text = "Общение, которое чувствуешь",
                    color = Color.White.copy(alpha = 0.5f),
                    style = MaterialTheme.typography.bodyLarge,
                )

                // E2E чип
                Row(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.04f))
                        .border(1.dp, DakkaColor.Violet.copy(alpha = 0.5f), CircleShape)
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Filled.Shield,
                        contentDescription = null,
                        tint = DakkaColor.Violet,
                        modifier = Modifier.size(13.dp),
                    )
                    Text(
                        "E2E-шифрование по умолчанию",
                        color = Color.White.copy(alpha = 0.85f),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            // Card with tabs + form
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(24.dp))
                    .background(Color.White.copy(alpha = 0.03f))
                    .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(24.dp))
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                // Tabs
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White.copy(alpha = 0.05f))
                        .padding(4.dp),
                ) {
                    AuthMode.entries.forEach { m ->
                        val selected = mode == m
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(38.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (selected) Brand.gradient else Color.Transparent)
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                ) { mode = m },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = m.title,
                                color = Color.White.copy(alpha = if (selected) 1f else 0.5f),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }

                AnimatedContent(
                    targetState = mode,
                    transitionSpec = {
                        if (targetState.ordinal > initialState.ordinal) {
                            slideInHorizontally { it / 4 } + fadeIn() togetherWith
                                slideOutHorizontally { -it / 4 } + fadeOut()
                        } else {
                            slideInHorizontally { -it / 4 } + fadeIn() togetherWith
                                slideOutHorizontally { it / 4 } + fadeOut()
                        }
                    },
                    label = "tab-content",
                ) { currentMode ->
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        when (currentMode) {
                            AuthMode.Login -> {
                                BrandTextField(
                                    label = "Логин, телефон или email",
                                    value = login,
                                    onValueChange = { login = it },
                                    placeholder = "@username",
                                )
                                BrandTextField(
                                    label = "Пароль",
                                    value = password,
                                    onValueChange = { password = it },
                                    placeholder = "••••••••",
                                    isSecure = true,
                                )
                            }
                            AuthMode.Register -> {
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    BrandTextField(
                                        label = "Username",
                                        value = username,
                                        onValueChange = { username = it },
                                        placeholder = "username",
                                        modifier = Modifier.weight(1f),
                                    )
                                    BrandTextField(
                                        label = "Имя",
                                        value = displayName,
                                        onValueChange = { displayName = it },
                                        placeholder = "Иван",
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                BrandTextField(
                                    label = "Телефон (необязательно)",
                                    value = phone,
                                    onValueChange = { phone = it },
                                    placeholder = "+7 900 000 00 00",
                                )
                                BrandTextField(
                                    label = "Пароль",
                                    value = password,
                                    onValueChange = { password = it },
                                    placeholder = "Минимум 8 символов",
                                    isSecure = true,
                                )

                                // E2E подсказка
                                Row(
                                    Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(DakkaColor.Violet.copy(alpha = 0.1f))
                                        .border(1.dp, DakkaColor.Violet.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
                                        .padding(horizontal = 14.dp, vertical = 10.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Icon(
                                        Icons.Filled.Shield,
                                        contentDescription = null,
                                        tint = DakkaColor.Violet,
                                        modifier = Modifier.size(16.dp),
                                    )
                                    Text(
                                        "При регистрации автоматически создаётся ключ шифрования. Приватный ключ хранится только на вашем устройстве.",
                                        color = DakkaColor.Violet.copy(alpha = 0.85f),
                                        style = MaterialTheme.typography.bodySmall.copy(lineHeight = 16.sp),
                                    )
                                }
                            }
                        }
                    }
                }

                AnimatedVisibility(
                    visible = error != null,
                    enter = expandVertically(spring()) + fadeIn(),
                    exit = shrinkVertically(spring()) + fadeOut(),
                ) {
                    Text(
                        text = error.orEmpty(),
                        color = DakkaColor.DangerSoft,
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Start,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(DakkaColor.Danger.copy(alpha = 0.1f))
                            .border(1.dp, DakkaColor.Danger.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    )
                }

                BrandButton(
                    text = if (mode == AuthMode.Login) "Войти" else "Создать аккаунт",
                    isLoading = loading,
                    onClick = {
                        error = null
                        loading = true
                        scope.launch {
                            try {
                                val resp = if (mode == AuthMode.Login) {
                                    AuthApi.login(
                                        login = login.trim(),
                                        password = password,
                                        deviceId = UUID.randomUUID().toString(),
                                        deviceName = "Android",
                                    )
                                } else {
                                    AuthApi.register(
                                        username = username.trim(),
                                        displayName = displayName.trim(),
                                        password = password,
                                        phone = phone.takeIf { it.isNotBlank() },
                                        publicKey = null,  // TODO: E2E генерация в след. сессии
                                    )
                                }
                                auth.setAuth(resp.user, resp.tokens.accessToken)
                            } catch (e: Exception) {
                                error = e.message ?: "Ошибка"
                            } finally {
                                loading = false
                            }
                        }
                    },
                )
            }

            Spacer(Modifier.height(20.dp))
        }
    }
}

