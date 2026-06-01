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
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/**
 * Запись видео-кружка через CameraX VideoCapture.
 * • Превью отдаётся через [bindPreview] (для Compose AndroidView)
 * • record() / stop() — возвращают (file, durationSec) или null
 * • Авто-стоп на maxDurationMs
 */
class CircleRecorder(private val context: Context) {

    enum class Facing { Front, Back }

    val ready = MutableStateFlow(false)
    val recording = MutableStateFlow(false)
    val durationMs = MutableStateFlow(0L)

    private var cameraProvider: ProcessCameraProvider? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var currentRecording: Recording? = null
    private var facing: Facing = Facing.Front
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
     * Биндинг CameraX к LifecycleOwner. Вызывать когда Preview готов
     * (например в Composable LaunchedEffect).
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
        val outFile = File(context.cacheDir, "circle-${System.currentTimeMillis()}.mp4")
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
                    // file готов — слушатель stop() прочитает его
                }
            }
    }

    /**
     * Останавливает запись. Suspend — ждёт пока Finalize дойдёт,
     * чтобы вернуть готовый файл.
     */
    suspend fun stop(): Pair<File, Int>? = suspendCoroutine { cont ->
        val rec = currentRecording ?: run {
            cont.resume(null)
            return@suspendCoroutine
        }
        val outFile = File(context.cacheDir).listFiles { f -> f.name.startsWith("circle-") }
            ?.maxByOrNull { it.lastModified() }

        // Перевешиваем listener чтобы поймать Finalize
        rec.stop()
        scope.launch {
            // Маленькая задержка — даём VideoRecordEvent.Finalize обработаться
            delay(200)
            currentRecording = null
            if (outFile == null || !outFile.exists() || outFile.length() < 1000) {
                cont.resume(null)
                return@launch
            }
            val durSec = (durationMs.value / 1000).toInt().coerceAtLeast(1)
            if (durSec < 1) {
                outFile.delete()
                cont.resume(null)
            } else {
                cont.resume(outFile to durSec)
            }
        }
    }

    fun cancel() {
        currentRecording?.stop()
        currentRecording = null
        recording.value = false
        tickJob?.cancel()
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
