package online.akkdmsg.dakka.chat

import android.Manifest
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import online.akkdmsg.dakka.media.AudioRecorder
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor
import java.io.File
import kotlin.math.max

@Composable
fun MessageInput(
    text: String,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit,
    onImagePicked: (Uri) -> Unit,
    onVoiceRecorded: (file: File, durationSec: Int, waveform: List<Float>) -> Unit,
    onCircleRequested: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val hasText = text.isNotBlank()
    val recorder = remember { AudioRecorder(context) }
    val isRecording by recorder.isRecording.collectAsState()
    val durationMs by recorder.durationMs.collectAsState()
    val levels by recorder.levels.collectAsState()

    val photoLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri: Uri? -> uri?.let(onImagePicked) }

    val micPermission = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) recorder.start() }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(DakkaColor.Surface.copy(alpha = 0.85f))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isRecording) {
            CancelChip(onCancel = { recorder.cancel() })
            LiveWaveform(levels = levels, modifier = Modifier.weight(1f))
            Text(
                text = "%d:%02d".format(durationMs / 60_000, (durationMs / 1000) % 60),
                color = Color.White.copy(alpha = 0.75f),
                style = MaterialTheme.typography.labelSmall,
            )
            SendCircle(onClick = {
                val captured = recorder.stop() ?: return@SendCircle
                onVoiceRecorded(captured.first, captured.second, captured.third)
            })
        } else {
            AttachButton(onClick = {
                photoLauncher.launch(
                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                )
            })
            TextArea(text = text, onTextChange = onTextChange, modifier = Modifier.weight(1f))
            if (hasText) {
                SendCircle(onClick = onSend)
            } else {
                CircleButton(onClick = onCircleRequested)
                MicButton(onClick = { micPermission.launch(Manifest.permission.RECORD_AUDIO) })
            }
        }
    }
}

// ── Pieces ───────────────────────────────────────────────────────────────────

@Composable
private fun AttachButton(onClick: () -> Unit) {
    Box(
        Modifier
            .size(40.dp)
            .clip(CircleShape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.AttachFile, null, tint = Color.White.copy(alpha = 0.55f), modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun TextArea(text: String, onTextChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(24.dp))
            .background(Color.White.copy(alpha = 0.04f))
            .border(
                1.dp,
                if (focused) DakkaColor.Violet.copy(alpha = 0.5f) else Color.White.copy(alpha = 0.07f),
                RoundedCornerShape(24.dp),
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        BasicTextField(
            value = text,
            onValueChange = onTextChange,
            singleLine = false,
            maxLines = 5,
            cursorBrush = SolidColor(DakkaColor.Violet),
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.White),
            interactionSource = interactionSource,
            modifier = Modifier.fillMaxWidth(),
        )
        if (text.isEmpty()) {
            Text("Сообщение…", color = Color.White.copy(alpha = 0.3f), style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
private fun SendCircle(onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .shadow(14.dp, CircleShape, ambientColor = DakkaColor.Violet, spotColor = DakkaColor.Violet)
            .clip(CircleShape)
            .background(Brand.gradient)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.Send, "Send", tint = Color.White, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun CircleButton(onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.06f))
            .border(1.dp, Color.White.copy(alpha = 0.08f), CircleShape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            androidx.compose.material.icons.Icons.Filled.Circle,
            "Video circle",
            tint = Color.White.copy(alpha = 0.55f),
            modifier = Modifier.size(20.dp),
        )
    }
}

@Composable
private fun MicButton(onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.06f))
            .border(1.dp, Color.White.copy(alpha = 0.08f), CircleShape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.Mic, "Record voice", tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun CancelChip(onCancel: () -> Unit) {
    Box(
        Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(DakkaColor.Danger.copy(alpha = 0.85f))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onCancel,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.Close, "Cancel", tint = Color.White, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun LiveWaveform(levels: List<Float>, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .height(40.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.04f))
            .border(1.dp, Color.White.copy(alpha = 0.07f), CircleShape)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        levels.forEach { h ->
            Box(
                Modifier
                    .weight(1f)
                    .height(max(3.dp, (h * 22).dp))
                    .clip(CircleShape)
                    .background(DakkaColor.Danger),
            )
        }
    }
}
