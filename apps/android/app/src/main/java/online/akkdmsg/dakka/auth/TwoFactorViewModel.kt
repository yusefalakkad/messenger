package online.akkdmsg.dakka.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import online.akkdmsg.dakka.data.api.TwoFactorApi

/**
 * Состояние:
 *  - Loading: пока тянем /status
 *  - Disabled: 2FA выключено, можно нажать «Включить»
 *  - SetupPending: получили secret/otpauth — показываем QR + поле кода
 *  - Enabled: 2FA включено, показываем recovery counter + «Отключить»
 *  - ShowRecovery: только что включили — показываем коды одноразово
 */
sealed class TwoFactorState {
    object Loading : TwoFactorState()
    data class Disabled(val starting: Boolean = false) : TwoFactorState()
    data class SetupPending(
        val secret: String,
        val otpauthUrl: String,
        val submitting: Boolean = false,
    ) : TwoFactorState()
    data class Enabled(val remainingRecovery: Int, val disabling: Boolean = false) : TwoFactorState()
    data class ShowRecovery(val codes: List<String>) : TwoFactorState()
}

class TwoFactorViewModel : ViewModel() {

    private val _state = MutableStateFlow<TwoFactorState>(TwoFactorState.Loading)
    val state: StateFlow<TwoFactorState> = _state.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.value = TwoFactorState.Loading
            try {
                val s = TwoFactorApi.status()
                _state.value = if (s.enabled) {
                    TwoFactorState.Enabled(remainingRecovery = s.remainingRecoveryCodes)
                } else {
                    TwoFactorState.Disabled()
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Не удалось получить статус 2FA"
                _state.value = TwoFactorState.Disabled()
            }
        }
    }

    fun startSetup() {
        val current = _state.value
        if (current !is TwoFactorState.Disabled) return
        _state.value = TwoFactorState.Disabled(starting = true)
        viewModelScope.launch {
            try {
                val r = TwoFactorApi.setup()
                _state.value = TwoFactorState.SetupPending(
                    secret = r.secret,
                    otpauthUrl = r.otpauthUrl,
                )
            } catch (e: Exception) {
                _error.value = e.message ?: "Не удалось начать настройку"
                _state.value = TwoFactorState.Disabled()
            }
        }
    }

    fun confirmEnable(code: String) {
        val cur = _state.value as? TwoFactorState.SetupPending ?: return
        _state.value = cur.copy(submitting = true)
        viewModelScope.launch {
            try {
                val r = TwoFactorApi.enable(code.trim())
                _state.value = TwoFactorState.ShowRecovery(codes = r.recoveryCodes)
            } catch (e: Exception) {
                _error.value = e.message ?: "Неверный код"
                _state.value = cur.copy(submitting = false)
            }
        }
    }

    fun finishRecovery() {
        // После того как пользователь сохранил коды — переключаемся на Enabled
        refresh()
    }

    fun disable(password: String, code: String) {
        val cur = _state.value as? TwoFactorState.Enabled ?: return
        _state.value = cur.copy(disabling = true)
        viewModelScope.launch {
            try {
                TwoFactorApi.disable(password.trim(), code.trim())
                _state.value = TwoFactorState.Disabled()
            } catch (e: Exception) {
                _error.value = e.message ?: "Не удалось отключить 2FA"
                _state.value = cur.copy(disabling = false)
            }
        }
    }

    fun clearError() { _error.value = null }
}
