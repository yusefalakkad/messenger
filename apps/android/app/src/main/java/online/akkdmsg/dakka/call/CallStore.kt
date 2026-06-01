package online.akkdmsg.dakka.call

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Глобальное observable состояние звонка для UI. */
object CallStore {
    private val _state = MutableStateFlow<CallState>(CallState.Idle)
    val state: StateFlow<CallState> = _state.asStateFlow()

    private val _isMuted = MutableStateFlow(false)
    val isMuted: StateFlow<Boolean> = _isMuted.asStateFlow()

    private val _isVideoOff = MutableStateFlow(false)
    val isVideoOff: StateFlow<Boolean> = _isVideoOff.asStateFlow()

    private val _isSpeakerOn = MutableStateFlow(true)
    val isSpeakerOn: StateFlow<Boolean> = _isSpeakerOn.asStateFlow()

    private val _isSharingScreen = MutableStateFlow(false)
    val isSharingScreen: StateFlow<Boolean> = _isSharingScreen.asStateFlow()

    internal fun setState(s: CallState)        { _state.value = s }
    internal fun setMuted(v: Boolean)          { _isMuted.value = v }
    internal fun setVideoOff(v: Boolean)       { _isVideoOff.value = v }
    internal fun setSpeakerOn(v: Boolean)      { _isSpeakerOn.value = v }
    internal fun setSharingScreen(v: Boolean)  { _isSharingScreen.value = v }

    internal fun reset() {
        _state.value = CallState.Idle
        _isMuted.value = false
        _isVideoOff.value = false
        _isSpeakerOn.value = true
        _isSharingScreen.value = false
    }
}
