package online.akkdmsg.dakka.auth

import android.content.Context
import android.widget.Toast
import online.akkdmsg.dakka.util.copyToClipboard
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.BrandButton
import online.akkdmsg.dakka.ui.components.BrandTextField
import online.akkdmsg.dakka.ui.components.QrCode
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun TwoFactorScreen(onBack: () -> Unit) {
    val vm: TwoFactorViewModel = viewModel()
    val state by vm.state.collectAsState()
    val error by vm.error.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(error) {
        error?.let {
            Toast.makeText(context, it, Toast.LENGTH_SHORT).show()
            vm.clearError()
        }
    }

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()

        Column(Modifier.fillMaxSize()) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 4.dp, end = 12.dp, top = 28.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack, "Назад",
                        tint = Color.White.copy(alpha = 0.85f),
                    )
                }
                Text(
                    "Двухфакторная аутентификация",
                    color = Color.White,
                    style = MaterialTheme.typography.titleMedium,
                )
            }

            AnimatedContent(
                targetState = state,
                transitionSpec = { fadeIn() togetherWith fadeOut() },
                label = "2fa-state",
            ) { s ->
                Column(
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 18.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    when (s) {
                        is TwoFactorState.Loading -> CenteredSpinner()

                        is TwoFactorState.Disabled -> DisabledView(starting = s.starting, vm = vm)

                        is TwoFactorState.SetupPending -> SetupView(
                            secret = s.secret,
                            otpauthUrl = s.otpauthUrl,
                            submitting = s.submitting,
                            onSubmit = { code -> vm.confirmEnable(code) },
                            onCopySecret = { copyToClipboard(context, s.secret, "Секрет скопирован") },
                        )

                        is TwoFactorState.ShowRecovery -> RecoveryView(
                            codes = s.codes,
                            onCopyAll = { copyToClipboard(context, s.codes.joinToString("\n"), "Коды скопированы") },
                            onDone = vm::finishRecovery,
                        )

                        is TwoFactorState.Enabled -> EnabledView(
                            remainingRecovery = s.remainingRecovery,
                            disabling = s.disabling,
                            onDisable = { p, c -> vm.disable(p, c) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CenteredSpinner() {
    Box(Modifier.fillMaxWidth().padding(top = 80.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = DakkaColor.Violet)
    }
}

@Composable
private fun DisabledView(starting: Boolean, vm: TwoFactorViewModel) {
    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Filled.Shield, null, tint = DakkaColor.Violet, modifier = Modifier.size(22.dp))
            Text("2FA не настроено", color = Color.White, style = MaterialTheme.typography.titleSmall)
        }
        Text(
            "Защитите аккаунт одноразовыми кодами из приложения-аутентификатора " +
                "(Google Authenticator, 1Password, Authy и т. д.).",
            color = Color.White.copy(alpha = 0.6f),
            style = MaterialTheme.typography.bodyMedium,
        )
        BrandButton(
            text = "Включить 2FA",
            isLoading = starting,
            onClick = vm::startSetup,
        )
    }
}

@Composable
private fun SetupView(
    secret: String,
    otpauthUrl: String,
    submitting: Boolean,
    onSubmit: (String) -> Unit,
    onCopySecret: () -> Unit,
) {
    var code by remember { mutableStateOf("") }

    SectionCard {
        Text("Шаг 1. Отсканируйте QR-код", color = Color.White, style = MaterialTheme.typography.titleSmall)
        Text(
            "Откройте Google Authenticator или другое TOTP-приложение и добавьте новую запись.",
            color = Color.White.copy(alpha = 0.55f),
            style = MaterialTheme.typography.bodySmall,
        )
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            QrCode(data = otpauthUrl)
        }

        Spacer(Modifier.size(2.dp))
        Text(
            "Или введите секрет вручную:",
            color = Color.White.copy(alpha = 0.55f),
            style = MaterialTheme.typography.bodySmall,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White.copy(alpha = 0.04f))
                .border(1.dp, Color.White.copy(alpha = 0.07f), RoundedCornerShape(12.dp))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onCopySecret,
                )
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                secret,
                color = Color.White,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            Icon(
                Icons.Filled.ContentCopy, null,
                tint = DakkaColor.Violet, modifier = Modifier.size(16.dp),
            )
        }
    }

    SectionCard {
        Text("Шаг 2. Введите 6-значный код", color = Color.White, style = MaterialTheme.typography.titleSmall)
        BrandTextField(
            label = "Код",
            value = code,
            onValueChange = { code = it.filter { ch -> ch.isDigit() }.take(8) },
            placeholder = "123 456",
            keyboardType = KeyboardType.NumberPassword,
        )
        BrandButton(
            text = "Включить",
            isLoading = submitting,
            enabled = code.length >= 6 && !submitting,
            onClick = { onSubmit(code) },
        )
    }
}

@Composable
private fun RecoveryView(codes: List<String>, onCopyAll: () -> Unit, onDone: () -> Unit) {
    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Filled.CheckCircle, null, tint = DakkaColor.Violet, modifier = Modifier.size(22.dp))
            Text("2FA включено", color = Color.White, style = MaterialTheme.typography.titleSmall)
        }
        Text(
            "Сохраните эти одноразовые коды восстановления в надёжном месте. " +
                "Они показываются только один раз и позволяют войти, если вы потеряете доступ к приложению.",
            color = Color.White.copy(alpha = 0.6f),
            style = MaterialTheme.typography.bodyMedium,
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White.copy(alpha = 0.04f))
                .border(1.dp, Color.White.copy(alpha = 0.07f), RoundedCornerShape(12.dp))
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            codes.forEach { c ->
                Text(c, color = Color.White, style = MaterialTheme.typography.bodyMedium)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(
                Modifier
                    .weight(1f)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.06f))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = onCopyAll,
                    )
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Filled.ContentCopy, null, tint = Color.White, modifier = Modifier.size(15.dp))
                    Text("Копировать", color = Color.White, style = MaterialTheme.typography.bodyMedium)
                }
            }
            BrandButton(
                text = "Готово",
                modifier = Modifier.weight(1f),
                onClick = onDone,
            )
        }
    }
}

@Composable
private fun EnabledView(
    remainingRecovery: Int,
    disabling: Boolean,
    onDisable: (String, String) -> Unit,
) {
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }

    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Filled.CheckCircle, null, tint = DakkaColor.Violet, modifier = Modifier.size(22.dp))
            Text("2FA активно", color = Color.White, style = MaterialTheme.typography.titleSmall)
        }
        Text(
            "Осталось одноразовых кодов восстановления: $remainingRecovery",
            color = Color.White.copy(alpha = 0.6f),
            style = MaterialTheme.typography.bodySmall,
        )
    }

    SectionCard {
        Text("Отключить 2FA", color = Color.White, style = MaterialTheme.typography.titleSmall)
        Text(
            "Для отключения требуется текущий пароль и одноразовый код из приложения.",
            color = Color.White.copy(alpha = 0.55f),
            style = MaterialTheme.typography.bodySmall,
        )
        BrandTextField(
            label = "Пароль",
            value = password,
            onValueChange = { password = it },
            isSecure = true,
        )
        BrandTextField(
            label = "Код",
            value = code,
            onValueChange = { code = it.filter { ch -> ch.isDigit() }.take(8) },
            placeholder = "123 456",
            keyboardType = KeyboardType.NumberPassword,
        )
        BrandButton(
            text = "Отключить",
            isLoading = disabling,
            enabled = password.isNotEmpty() && code.length >= 6 && !disabling,
            onClick = { onDisable(password, code) },
        )
    }
}

@Composable
private fun SectionCard(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Color.White.copy(alpha = 0.04f))
            .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(18.dp))
            .padding(horizontal = 16.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

private fun copyToClipboard(context: Context, text: String, toast: String) {
    context.copyToClipboard(text, sensitive = true)
    Toast.makeText(context, toast, Toast.LENGTH_SHORT).show()
}
