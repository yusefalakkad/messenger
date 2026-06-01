package online.akkdmsg.dakka.media

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import kotlin.math.ln

/**
 * Запись голосового сообщения через MediaRecorder.
 * Параметры: m4a / AAC, 64 kbps mono — компактно и кросс-платформенно.
 * Параллельно сэмплит maxAmplitude для live waveform.
 */
class AudioRecorder(private val context: Context) {

    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording.asStateFlow()

    private val _durationMs = MutableStateFlow(0L)
    val durationMs: StateFlow<Long> = _durationMs.asStateFlow()

    private val _levels = MutableStateFlow<List<Float>>(emptyList())
    val levels: StateFlow<List<Float>> = _levels.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var tickJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Default)

    private val maxBars = 40
    private val maxDurationMs = 5 * 60_000L  // 5 минут

    /** Запускает запись. Возвращает true если получилось. */
    fun start(): Boolean {
        if (_isRecording.value) return false
        val out = File(context.cacheDir, "voice-${System.currentTimeMillis()}.m4a")
        file = out
        _levels.value = emptyList()
        _durationMs.value = 0L

        @Suppress("DEPRECATION")
        val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            MediaRecorder()
        }
        try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioChannels(1)
            r.setAudioSamplingRate(44_100)
            r.setAudioEncodingBitRate(64_000)
            r.setOutputFile(out.absolutePath)
            r.prepare()
            r.start()
        } catch (e: Exception) {
            _error.value = e.message
            r.release()
            return false
        }
        recorder = r
        _isRecording.value = true
        startTick()
        return true
    }

    /** Останавливает. Возвращает (file, durationSec, waveform) или null если < 0.4s. */
    fun stop(): Triple<File, Int, List<Float>>? {
        val r = recorder ?: return null
        tickJob?.cancel()
        try { r.stop() } catch (_: Exception) { /* recorder was not started long enough */ }
        r.release()
        recorder = null
        _isRecording.value = false

        val out = file ?: return null
        val dur = _durationMs.value
        val levels = _levels.value
        if (dur < 400) {
            out.delete()
            return null
        }
        return Triple(out, (dur / 1000).toInt().coerceAtLeast(1), levels)
    }

    fun cancel() {
        recorder?.let {
            tickJob?.cancel()
            try { it.stop() } catch (_: Exception) {}
            it.release()
        }
        recorder = null
        file?.delete()
        _isRecording.value = false
        _levels.value = emptyList()
        _durationMs.value = 0L
    }

    private fun startTick() {
        tickJob?.cancel()
        tickJob = scope.launch {
            while (_isRecording.value) {
                delay(33)  // ~30 Гц
                val r = recorder ?: break
                val amp = try { r.maxAmplitude } catch (_: Exception) { 0 }
                // Нормируем по логарифмической шкале (peak ~32767)
                val normalized = if (amp > 0) (ln(amp.toDouble()) / ln(32767.0)).toFloat().coerceIn(0f, 1f) else 0f
                val newLevels = (_levels.value + normalized).takeLast(maxBars)
                _levels.value = newLevels
                _durationMs.value += 33
                if (_durationMs.value >= maxDurationMs) {
                    // Авто-стоп — сообщим VM через flow, она вызовет stop()
                    break
                }
            }
        }
    }

    fun close() {
        cancel()
        scope.cancel()
    }
}
