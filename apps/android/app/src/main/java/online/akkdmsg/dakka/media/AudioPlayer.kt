package online.akkdmsg.dakka.media

import android.media.MediaPlayer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Воспроизведение голосовых через MediaPlayer.
 * Глобальный синглтон — при тапе на новое сообщение старое автоматически
 * останавливается. UI подписывается на currentUrl/isPlaying/progress через
 * StateFlow.
 */
object AudioPlayer {

    private val _currentUrl = MutableStateFlow<String?>(null)
    val currentUrl: StateFlow<String?> = _currentUrl.asStateFlow()

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _progress = MutableStateFlow(0f)   // 0..1
    val progress: StateFlow<Float> = _progress.asStateFlow()

    private val _durationMs = MutableStateFlow(0)
    val durationMs: StateFlow<Int> = _durationMs.asStateFlow()

    private var player: MediaPlayer? = null
    private var tickJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main)

    /** Toggle play/pause для указанного url. Если другой playing — переключается. */
    fun toggle(url: String) {
        val cur = _currentUrl.value
        if (cur == url && player != null) {
            val p = player!!
            if (p.isPlaying) {
                p.pause()
                _isPlaying.value = false
            } else {
                p.start()
                _isPlaying.value = true
                startTick()
            }
            return
        }
        // Новый трек
        stop()
        val p = MediaPlayer()
        try {
            p.setDataSource(url)
            p.setOnPreparedListener {
                _durationMs.value = it.duration
                it.start()
                _isPlaying.value = true
                startTick()
            }
            p.setOnCompletionListener {
                _isPlaying.value = false
                _progress.value = 0f
                it.seekTo(0)
            }
            p.setOnErrorListener { _, _, _ -> stop(); true }
            p.prepareAsync()
            player = p
            _currentUrl.value = url
        } catch (_: Exception) {
            p.release()
        }
    }

    fun stop() {
        tickJob?.cancel()
        player?.apply { try { stop() } catch (_: Exception) {}; release() }
        player = null
        _currentUrl.value = null
        _isPlaying.value = false
        _progress.value = 0f
        _durationMs.value = 0
    }

    private fun startTick() {
        tickJob?.cancel()
        tickJob = scope.launch {
            while (_isPlaying.value) {
                val p = player ?: break
                val dur = _durationMs.value
                if (dur > 0) {
                    _progress.value = (p.currentPosition.toFloat() / dur).coerceIn(0f, 1f)
                }
                delay(50)
            }
        }
    }
}
