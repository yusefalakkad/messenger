package online.akkdmsg.dakka.chat

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlipCameraAndroid
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch
import online.akkdmsg.dakka.media.CircleRecorder
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor
import java.io.File

@Composable
fun CircleRecorderScreen(
    onRecorded: (File, Int) -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val recorder = remember { CircleRecorder(context) }
    val ready by recorder.ready.collectAsState()
    val recording by recorder.recording.collectAsState()
    val durationMs by recorder.durationMs.collectAsState()

    var hasCameraPermission by remember { mutableStateOf(recorder.hasCameraPermission()) }

    val camPermission = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        hasCameraPermission = result[Manifest.permission.CAMERA] == true &&
                              result[Manifest.permission.RECORD_AUDIO] == true
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            camPermission.launch(
                arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
            )
        }
    }

    // Lifecycle cleanup
    DisposableEffect(Unit) {
        onDispose { recorder.close() }
    }

    val previewView = remember {
        PreviewView(context).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
    }

    LaunchedEffect(hasCameraPermission) {
        if (hasCameraPermission) {
            recorder.bind(owner, previewView.surfaceProvider)
        }
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black),
        contentAlignment = Alignment.Center,
    ) {
        // Круглое превью
        Box(
            Modifier
                .size(300.dp)
                .shadow(40.dp, CircleShape, ambientColor = DakkaColor.Violet, spotColor = DakkaColor.Violet)
                .clip(CircleShape)
                .border(
                    width = if (recording) 6.dp else 3.dp,
                    brush = Brand.gradient,
                    shape = CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (ready) {
                AndroidView(
                    factory = { previewView },
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                CircularProgressIndicator(color = Color.White)
            }
        }

        // Top bar
        Row(
            Modifier
                .align(Alignment.TopCenter)
                .padding(top = 40.dp)
                .fillMaxWidth()
                .padding(horizontal = 24.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Box(
                Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.12f))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) {
                        recorder.cancel()
                        onCancel()
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Close, "Cancel", tint = Color.White, modifier = Modifier.size(18.dp))
            }
            Box(
                Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.12f))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) {
                        scope.launch {
                            recorder.switchCamera(owner, previewView.surfaceProvider)
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.FlipCameraAndroid, "Switch", tint = Color.White, modifier = Modifier.size(18.dp))
            }
        }

        // Timer (когда идёт запись)
        if (recording) {
            Text(
                text = "%d:%02d / 1:00".format(durationMs / 60_000, (durationMs / 1000) % 60),
                color = Color.White.copy(alpha = 0.85f),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 100.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color.White.copy(alpha = 0.12f))
                    .padding(horizontal = 12.dp, vertical = 5.dp),
            )
        }

        // Record button
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 60.dp)
                .size(84.dp),
            contentAlignment = Alignment.Center,
        ) {
            // Прогресс-кольцо вокруг кнопки
            Box(
                Modifier
                    .size(84.dp)
                    .clip(CircleShape)
                    .border(4.dp, Color.White.copy(alpha = 0.15f), CircleShape)
            )
            if (recording) {
                CircularProgressIndicator(
                    progress = { (durationMs.toFloat() / recorder.maxDurationMs).coerceIn(0f, 1f) },
                    modifier = Modifier.size(84.dp),
                    color = DakkaColor.Violet,
                    strokeWidth = 4.dp,
                    trackColor = Color.Transparent,
                )
            }
            // Сам кружок
            Box(
                Modifier
                    .size(if (recording) 44.dp else 68.dp)
                    .clip(if (recording) RoundedCornerShape(8.dp) else CircleShape)
                    .background(if (recording) DakkaColor.Danger else Color.White)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = ready,
                    ) {
                        if (recording) {
                            scope.launch {
                                val captured = recorder.stop() ?: return@launch
                                onRecorded(captured.first, captured.second)
                            }
                        } else {
                            recorder.record()
                        }
                    }
            )
        }
    }
}
