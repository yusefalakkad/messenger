package online.akkdmsg.dakka.auth

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import online.akkdmsg.dakka.data.api.AuthApi
import online.akkdmsg.dakka.data.crypto.E2E

/**
 * Поток входа по номеру: phone → (опц.) link-bot → code → (опц.) profile.
 *
 * Бэк может вернуть `telegramDeepLink` — это значит юзер ещё не привязал бота.
 * Тогда показываем шаг с кнопкой «Открыть Telegram», иначе сразу идём на ввод кода.
 */
sealed class PhoneAuthStep {
    object Phone : PhoneAuthStep()
    data class LinkBot(val deepLink: String) : PhoneAuthStep()
    data class Code(val devOtpHint: String?) : PhoneAuthStep()
    data class Profile(val verifyToken: String) : PhoneAuthStep()
}

class PhoneAuthViewModel(private val context: Context) : ViewModel() {

    private val auth: AuthStore = AuthStore.get(context)

    private val _step = MutableStateFlow<PhoneAuthStep>(PhoneAuthStep.Phone)
    val step: StateFlow<PhoneAuthStep> = _step.asStateFlow()

    private val _phone = MutableStateFlow("")
    val phone: StateFlow<String> = _phone.asStateFlow()

    private val _code = MutableStateFlow("")
    val code: StateFlow<String> = _code.asStateFlow()

    private val _displayName = MutableStateFlow("")
    val displayName: StateFlow<String> = _displayName.asStateFlow()

    private val _username = MutableStateFlow("")
    val username: StateFlow<String> = _username.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _resendIn = MutableStateFlow(0)
    val resendIn: StateFlow<Int> = _resendIn.asStateFlow()

    fun setPhone(s: String) { _phone.value = s }
    fun setCode(s: String) { _code.value = s.filter { it.isDigit() }.take(8) }
    fun setDisplayName(s: String) { _displayName.value = s.take(64) }
    fun setUsername(s: String) {
        _username.value = s.filter { it.isLetterOrDigit() || it == '_' }.take(32)
    }

    fun clearError() { _error.value = null }

    fun backToPhone() {
        _step.value = PhoneAuthStep.Phone
        _code.value = ""
        _error.value = null
    }

    fun proceedToCodeStep() {
        // С шага link-bot: предполагаем что юзер уже получил код в Telegram
        _step.value = PhoneAuthStep.Code(devOtpHint = null)
    }

    fun requestCode() {
        val p = _phone.value.trim()
        if (p.length < 5) return
        _error.value = null
        _loading.value = true
        viewModelScope.launch {
            try {
                val r = AuthApi.phoneRequestCode(p)
                startResendCooldown(r.cooldownSec)
                _step.value = if (r.telegramDeepLink != null) {
                    PhoneAuthStep.LinkBot(r.telegramDeepLink)
                } else {
                    PhoneAuthStep.Code(devOtpHint = r.devOtp)
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Не удалось отправить код"
            } finally {
                _loading.value = false
            }
        }
    }

    fun resendCode() {
        if (_resendIn.value > 0 || _loading.value) return
        requestCode()
    }

    /** Шаг 2 → отправка кода. Может перевести на профиль (новый юзер) или войти. */
    fun verifyCode(onLoggedIn: () -> Unit) {
        val p = _phone.value.trim()
        val c = _code.value.trim()
        if (c.length < 4) return
        _error.value = null
        _loading.value = true
        viewModelScope.launch {
            try {
                val r = AuthApi.phoneVerifyCode(
                    phone = p,
                    code = c,
                    deviceId = auth.deviceId,
                    deviceName = auth.deviceName,
                )
                if (r.isNewUser && r.verifyToken != null) {
                    _step.value = PhoneAuthStep.Profile(r.verifyToken)
                } else if (r.tokens != null) {
                    auth.setAuth(r.tokens.user, r.tokens.accessToken, privateKey = null)
                    onLoggedIn()
                } else {
                    _error.value = "Неожиданный ответ сервера"
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Неверный код"
            } finally {
                _loading.value = false
            }
        }
    }

    /** Шаг 3 (только для новых юзеров): сгенерировать ключ, заполнить профиль. */
    fun completeProfile(onLoggedIn: () -> Unit) {
        val token = (_step.value as? PhoneAuthStep.Profile)?.verifyToken ?: return
        val name = _displayName.value.trim()
        if (name.isEmpty()) return
        _error.value = null
        _loading.value = true
        viewModelScope.launch {
            try {
                val pair = E2E.generateKeyPair()
                val r = AuthApi.phoneCompleteProfile(
                    verifyToken = token,
                    displayName = name,
                    username = _username.value.ifEmpty { null },
                    publicKey = pair.publicKeyB64,
                    deviceId = auth.deviceId,
                    deviceName = auth.deviceName,
                )
                auth.setAuth(r.user, r.tokens.accessToken, privateKey = pair.privateKeyB64)
                onLoggedIn()
            } catch (e: Exception) {
                _error.value = e.message ?: "Не удалось завершить регистрацию"
            } finally {
                _loading.value = false
            }
        }
    }

    private fun startResendCooldown(seconds: Int) {
        _resendIn.value = seconds
        viewModelScope.launch {
            while (_resendIn.value > 0) {
                delay(1000)
                _resendIn.value = _resendIn.value - 1
            }
        }
    }
}
