package online.akkdmsg.dakka.auth

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.BrandButton
import online.akkdmsg.dakka.ui.components.BrandTextField
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor

/**
 * Единый экран входа по номеру — заменяет старый AuthScreen с табами Login/Register.
 * 4 шага: phone → (опц.) link-bot → code → (опц.) profile.
 */
@Composable
fun PhoneAuthScreen() {
    val context = LocalContext.current

    val vm: PhoneAuthViewModel = viewModel(
        factory = viewModelFactory {
            initializer { PhoneAuthViewModel(context.applicationContext) }
        },
    )

    val step by vm.step.collectAsState()
    val phone by vm.phone.collectAsState()
    val code by vm.code.collectAsState()
    val displayName by vm.displayName.collectAsState()
    val username by vm.username.collectAsState()
    val loading by vm.loading.collectAsState()
    val error by vm.error.collectAsState()
    val resendIn by vm.resendIn.collectAsState()

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(40.dp))
            HeaderBlock()

            Spacer(Modifier.height(6.dp))

            CardShell {
                AnimatedContent(
                    targetState = step,
                    transitionSpec = {
                        slideInHorizontally { it / 3 } + fadeIn() togetherWith
                            slideOutHorizontally { -it / 3 } + fadeOut()
                    },
                    label = "phone-auth-step",
                ) { s ->
                    when (s) {
                        is PhoneAuthStep.Phone -> PhoneStepView(
                            phone = phone, onPhoneChange = vm::setPhone,
                            loading = loading, error = error,
                            onClearError = vm::clearError,
                            onSubmit = vm::requestCode,
                        )
                        is PhoneAuthStep.LinkBot -> LinkBotStepView(
                            deepLink = s.deepLink,
                            onBack = vm::backToPhone,
                            onProceedToCode = vm::proceedToCodeStep,
                            error = error,
                            onClearError = vm::clearError,
                        )
                        is PhoneAuthStep.Code -> CodeStepView(
                            phone = phone,
                            code = code,
                            onCodeChange = vm::setCode,
                            devOtpHint = s.devOtpHint,
                            loading = loading,
                            error = error,
                            onClearError = vm::clearError,
                            resendIn = resendIn,
                            onResend = vm::resendCode,
                            onBack = vm::backToPhone,
                            onSubmit = { vm.verifyCode {} },
                        )
                        is PhoneAuthStep.Profile -> ProfileStepView(
                            displayName = displayName,
                            onDisplayNameChange = vm::setDisplayName,
                            username = username,
                            onUsernameChange = vm::setUsername,
                            loading = loading,
                            error = error,
                            onClearError = vm::clearError,
                            onSubmit = { vm.completeProfile {} },
                        )
                    }
                }
            }

            Spacer(Modifier.height(40.dp))
        }
    }
}

// ───────────────────────────────────────────────────────────────────────────────
// Шаги
// ───────────────────────────────────────────────────────────────────────────────

@Composable
private fun PhoneStepView(
    phone: String,
    onPhoneChange: (String) -> Unit,
    loading: Boolean,
    error: String?,
    onClearError: () -> Unit,
    onSubmit: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Введите ваш номер", color = Color.White, style = MaterialTheme.typography.titleMedium)
        Text(
            "Мы отправим одноразовый код через Telegram.",
            color = Color.White.copy(alpha = 0.55f),
            style = MaterialTheme.typography.bodySmall,
        )
        BrandTextField(
            label = "Номер телефона",
            value = phone,
            onValueChange = { onPhoneChange(it); onClearError() },
            placeholder = "+7 999 123-45-67",
            keyboardType = KeyboardType.Phone,
        )
        ErrorBlock(error)
        BrandButton(
            text = "Отправить код",
            isLoading = loading,
            enabled = phone.trim().length >= 5 && !loading,
            onClick = onSubmit,
        )
    }
}

@Composable
private fun LinkBotStepView(
    deepLink: String,
    onBack: () -> Unit,
    onProceedToCode: () -> Unit,
    error: String?,
    onClearError: () -> Unit,
) {
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        BackLink(onClick = onBack)
        Text("Откройте Dakka-бот в Telegram", color = Color.White, style = MaterialTheme.typography.titleMedium)
        Text(
            "Это разовое действие. Откройте бота, нажмите «Start», затем поделитесь номером. Код придёт прямо в этот чат.",
            color = Color.White.copy(alpha = 0.55f),
            style = MaterialTheme.typography.bodySmall,
        )

        // Big Telegram button — фирменный голубой
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(
                    Brush.linearGradient(
                        colors = listOf(Color(0xFF229ED9), Color(0xFF1B86B8)),
                    )
                )
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {
                        onClearError()
                        runCatching {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)).apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                            context.startActivity(intent)
                        }
                    },
                )
                .padding(vertical = 14.dp),
            contentAlignment = Alignment.Center,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.Send,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    "Открыть Telegram",
                    color = Color.White,
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            HintStep(num = 1, text = "Telegram откроется — нажмите «Start»")
            HintStep(num = 2, text = "Бот покажет кнопку «Поделиться номером» — нажмите её")
            HintStep(num = 3, text = "В чате с ботом появится код")
            HintStep(num = 4, text = "Вернитесь сюда и нажмите «У меня есть код»")
        }

        ErrorBlock(error)

        BrandButton(
            text = "У меня есть код",
            isLoading = false,
            onClick = onProceedToCode,
        )
    }
}

@Composable
private fun CodeStepView(
    phone: String,
    code: String,
    onCodeChange: (String) -> Unit,
    devOtpHint: String?,
    loading: Boolean,
    error: String?,
    onClearError: () -> Unit,
    resendIn: Int,
    onResend: () -> Unit,
    onBack: () -> Unit,
    onSubmit: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        BackLink(onClick = onBack)
        Text("Введите код", color = Color.White, style = MaterialTheme.typography.titleMedium)
        Text(
            "Мы отправили код на $phone",
            color = Color.White.copy(alpha = 0.55f),
            style = MaterialTheme.typography.bodySmall,
        )

        if (devOtpHint != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(9.dp))
                    .background(Color(0x14FF9F0A))
                    .border(1.dp, Color(0x33FF9F0A), RoundedCornerShape(9.dp))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "Dev-режим: код $devOtpHint",
                    color = Color(0xFFFFB94D),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        BrandTextField(
            label = "Код",
            value = code,
            onValueChange = { onCodeChange(it); onClearError() },
            placeholder = "123 456",
            keyboardType = KeyboardType.NumberPassword,
        )

        ErrorBlock(error)

        BrandButton(
            text = "Подтвердить",
            isLoading = loading,
            enabled = code.length >= 4 && !loading,
            onClick = onSubmit,
        )

        if (resendIn > 0) {
            Text(
                text = "Отправить новый код можно через ${resendIn}s",
                color = Color.White.copy(alpha = 0.3f),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
            )
        } else if (!loading) {
            ResendInlineButton(onClick = onResend)
        }
    }
}

@Composable
private fun ProfileStepView(
    displayName: String,
    onDisplayNameChange: (String) -> Unit,
    username: String,
    onUsernameChange: (String) -> Unit,
    loading: Boolean,
    error: String?,
    onClearError: () -> Unit,
    onSubmit: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Расскажите о себе", color = Color.White, style = MaterialTheme.typography.titleMedium)
        Text(
            "Эти данные увидят люди, с которыми вы переписываетесь.",
            color = Color.White.copy(alpha = 0.55f),
            style = MaterialTheme.typography.bodySmall,
        )

        BrandTextField(
            label = "Имя",
            value = displayName,
            onValueChange = { onDisplayNameChange(it); onClearError() },
            placeholder = "Иван Иванов",
        )

        BrandTextField(
            label = "Username — необязательно",
            value = username,
            onValueChange = { onUsernameChange(it); onClearError() },
            placeholder = "ivan",
        )

        ErrorBlock(error)

        BrandButton(
            text = "Готово",
            isLoading = loading,
            enabled = displayName.trim().isNotEmpty() && !loading,
            onClick = onSubmit,
        )
    }
}

// ───────────────────────────────────────────────────────────────────────────────
// Re-usable shells
// ───────────────────────────────────────────────────────────────────────────────

@Composable
private fun HeaderBlock() {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Логотип «D» на gradient
        Box(
            modifier = Modifier
                .size(80.dp)
                .clip(RoundedCornerShape(22.dp))
                .background(Brand.gradient),
            contentAlignment = Alignment.Center,
        ) {
            Text("D", color = Color.White, style = MaterialTheme.typography.headlineLarge)
        }
        Text("Dakka", color = Color.White, style = MaterialTheme.typography.headlineSmall)
        Text(
            "Общение, которое чувствуешь",
            color = Color.White.copy(alpha = 0.4f),
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun CardShell(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(Color.White.copy(alpha = 0.05f))
            .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(22.dp))
            .padding(18.dp),
    ) { content() }
}

@Composable
private fun BackLink(onClick: () -> Unit) {
    androidx.compose.material3.TextButton(
        onClick = onClick,
        contentPadding = PaddingValues(0.dp),
    ) {
        Text("← Сменить номер", color = Color.White.copy(alpha = 0.45f), style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun ErrorBlock(message: String?) {
    if (message.isNullOrBlank()) return
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(9.dp))
            .background(Color(0x14F43F5E))
            .border(1.dp, Color(0x33F43F5E), RoundedCornerShape(9.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(message, color = Color(0xFFFFD0D7), style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun HintStep(num: Int, text: String) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            "$num.",
            color = Color.White.copy(alpha = 0.85f),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.width(18.dp),
        )
        Text(text, color = Color.White.copy(alpha = 0.55f), style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun ResendInlineButton(onClick: () -> Unit) {
    androidx.compose.material3.TextButton(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            "Отправить новый код",
            color = DakkaColor.Violet.copy(alpha = 0.85f),
            style = MaterialTheme.typography.labelSmall,
        )
    }
}
