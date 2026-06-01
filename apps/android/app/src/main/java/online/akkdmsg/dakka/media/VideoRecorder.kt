package online.akkdmsg.dakka.media

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.content.ContextCompat
import androidx.core.content.PermissionChecker
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/**
 * Запись полноразмерного видео-сообщения через CameraX VideoCapture.
 * • Превью отдаётся через [bind] (для Compose AndroidView)
 * • record() / stop() — возвращают (file, durationSec) или null
 * • Авто-стоп на maxDurationMs (60 секунд)
 *
 * НЕ заменяет CircleRecorder — это отдельный API для полноразмерных видео.
 */
class VideoRecorder(private val context: Context) {

    enum class Facing { Front, Back }

    val ready = MutableStateFlow(false)
    val recording = MutableStateFlow(false)
    val durationMs = MutableStateFlow(0L)

    private var cameraProvider: ProcessCameraProvider? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var currentRecording: Recording? = null
    private var currentFile: File? = null
    private var facing: Facing = Facing.Back
    private var previewUseCase: Preview? = null

    private val scope = CoroutineScope(Dispatchers.Main)
    private var tickJob: Job? = null

    val maxDurationMs = 60_000L

    fun hasCameraPermission(): Boolean =
        PermissionChecker.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED &&
        PermissionChecker.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    /**
     * Биндинг CameraX к LifecycleOwner.
     * preview — выходная цель Preview use-case (PreviewView.surfaceProvider).
     */
    suspend fun bind(
        owner: LifecycleOwner,
        previewSurfaceProvider: Preview.SurfaceProvider,
        facing: Facing = this.facing,
    ) {
        this.facing = facing
        val provider = getProvider()
        provider.unbindAll()

        val selector = when (facing) {
            Facing.Front -> CameraSelector.DEFAULT_FRONT_CAMERA
            Facing.Back  -> CameraSelector.DEFAULT_BACK_CAMERA
        }
        val preview = Preview.Builder().build().also {
            it.setSurfaceProvider(previewSurfaceProvider)
        }
        val recorder = Recorder.Builder()
            .setQualitySelector(QualitySelector.from(Quality.HD))
            .build()
        val video = VideoCapture.withOutput(recorder)

        provider.bindToLifecycle(owner, selector, preview, video)
        previewUseCase = preview
        videoCapture = video
        ready.value = true
    }

    suspend fun switchCamera(owner: LifecycleOwner, previewSurfaceProvider: Preview.SurfaceProvider) {
        val next = if (facing == Facing.Front) Facing.Back else Facing.Front
        bind(owner, previewSurfaceProvider, next)
    }

    @SuppressLint("MissingPermission")
    fun record() {
        if (!ready.value || recording.value) return
        val vc = videoCapture ?: return
        val outFile = File(context.cacheDir, "video-${System.currentTimeMillis()}.mp4")
        currentFile = outFile
        val options = FileOutputOptions.Builder(outFile).build()

        currentRecording = vc.output
            .prepareRecording(context, options)
            .withAudioEnabled()
            .start(ContextCompat.getMainExecutor(context)) { event ->
                if (event is VideoRecordEvent.Start) {
                    recording.value = true
                    durationMs.value = 0
                    startTick()
                }
                if (event is VideoRecordEvent.Finalize) {
                    tickJob?.cancel()
                    recording.value = false
                }
            }
    }

    /**
     * Останавливает запись. Suspend — ждёт пока Finalize дойдёт.
     */
    suspend fun stop(): Pair<File, Int>? = suspendCoroutine { cont ->
        val rec = currentRecording ?: run {
            cont.resume(null)
            return@suspendCoroutine
        }
        val outFile = currentFile
        rec.stop()
        scope.launch {
            // Маленькая задержка — даём VideoRecordEvent.Finalize обработаться
            delay(250)
            currentRecording = null
            if (outFile == null || !outFile.exists() || outFile.length() < 1000) {
                cont.resume(null)
                return@launch
            }
            val durSec = (durationMs.value / 1000).toInt().coerceAtLeast(1)
            cont.resume(outFile to durSec)
        }
    }

    fun cancel() {
        currentRecording?.stop()
        currentRecording = null
        recording.value = false
        tickJob?.cancel()
        currentFile?.takeIf { it.exists() }?.delete()
        currentFile = null
    }

    fun close() {
        cancel()
        cameraProvider?.unbindAll()
        scope.cancel()
    }

    private suspend fun getProvider(): ProcessCameraProvider {
        cameraProvider?.let { return it }
        val provider = ProcessCameraProvider.awaitInstance(context)
        cameraProvider = provider
        return provider
    }

    private fun startTick() {
        tickJob?.cancel()
        tickJob = scope.launch {
            while (recording.value) {
                delay(50)
                durationMs.value += 50
                if (durationMs.value >= maxDurationMs) {
                    currentRecording?.stop()
                    break
                }
            }
        }
    }
}

/** Корутинная обёртка над listenable future от ProcessCameraProvider.getInstance. */
private suspend fun ProcessCameraProvider.Companion.awaitInstance(context: Context): ProcessCameraProvider =
    suspendCoroutine { cont ->
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            cont.resume(future.get())
        }, ContextCompat.getMainExecutor(context))
    }
