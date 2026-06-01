package online.akkdmsg.dakka.call

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.Avatar
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun IncomingCallView(info: CallInfo) {
    val permissions = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { granted ->
        val mic = granted[Manifest.permission.RECORD_AUDIO] == true
        val cam = info.type == CallType.Audio || granted[Manifest.permission.CAMERA] == true
        if (mic && cam) CallManager.acceptIncoming() else CallManager.rejectIncoming()
    }

    val infinite = rememberInfiniteTransition(label = "incoming-pulse")
    val pulse by infinite.animateFloat(
        initialValue = 1f, targetValue = 1.18f,
        animationSpec = infiniteRepeatable(tween(1500), RepeatMode.Reverse),
        label = "pulse-scale",
    )

    Box(Modifier.fillMaxSize()) {
        AmbientBackground()

        Column(
            Modifier.align(Alignment.Center).padding(top = 80.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Text(
                if (info.type == CallType.Video) "ВИДЕОЗВОНОК" else "АУДИОЗВОНОК",
                color = Color.White.copy(alpha = 0.6f),
                style = MaterialTheme.typography.labelSmall,
            )
            Box(Modifier.size(220.dp), contentAlignment = Alignment.Center) {
                Box(
                    Modifier
                        .size(220.dp)
                        .scale(pulse)
                        .clip(CircleShape)
                        .border(3.dp, Brand.gradient, CircleShape),
                )
                Avatar(url = info.peerAvatar, name = info.peerName, size = 180)
            }
            Text(info.peerName, color = Color.White, style = MaterialTheme.typography.headlineLarge)
            Text("Входящий вызов", color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.bodyMedium)
        }

        Row(
            Modifier.align(Alignment.BottomCenter).padding(bottom = 60.dp),
            horizontalArrangement = Arrangement.spacedBy(80.dp),
        ) {
            // Reject
            Box(
                Modifier
                    .size(72.dp)
                    .shadow(20.dp, CircleShape, ambientColor = DakkaColor.Danger, spotColor = DakkaColor.Danger)
                    .clip(CircleShape)
                    .background(DakkaColor.Danger)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { CallManager.rejectIncoming() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.CallEnd, "Reject", tint = Color.White, modifier = Modifier.size(28.dp))
            }

            // Accept
            Box(
                Modifier
                    .size(72.dp)
                    .shadow(20.dp, CircleShape, ambientColor = DakkaColor.Violet, spotColor = DakkaColor.Violet)
                    .clip(CircleShape)
                    .background(Brand.gradient)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) {
                        val perms = buildList {
                            add(Manifest.permission.RECORD_AUDIO)
                            if (info.type == CallType.Video) add(Manifest.permission.CAMERA)
                        }.toTypedArray()
                        permissions.launch(perms)
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (info.type == CallType.Video) Icons.Filled.Videocam else Icons.Filled.Phone,
                    "Accept",
                    tint = Color.White,
                    modifier = Modifier.size(28.dp),
                )
            }
        }
    }
}
