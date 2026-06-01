package online.akkdmsg.dakka.call

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.FlipCameraAndroid
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import online.akkdmsg.dakka.ui.components.AmbientBackground
import online.akkdmsg.dakka.ui.components.Avatar
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun ActiveCallView(info: CallInfo, isOutgoing: Boolean) {
    val muted by CallStore.isMuted.collectAsState()
    val videoOff by CallStore.isVideoOff.collectAsState()
    val speaker by CallStore.isSpeakerOn.collectAsState()
    val state by CallStore.state.collectAsState()

    val remoteTrack = CallManager.remoteVideoTrack
    val localTrack = CallManager.localVideoTrack
    val egl = CallManager.rendererEgl

    var elapsed by remember { mutableStateOf(0L) }
    LaunchedEffect(info.id) {
        while (true) {
            delay(1000)
            elapsed = (System.currentTimeMillis() - info.startedAt) / 1000
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        // Background: remote video (если video) или ambient
        if (info.type == CallType.Video && remoteTrack != null) {
            VideoRenderer(track = remoteTrack, eglBase = egl, modifier = Modifier.fillMaxSize())
        } else {
            AmbientBackground()
            Column(
                Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Avatar(url = info.peerAvatar, name = info.peerName, size = 140)
            }
        }

        // Header
        Column(
            Modifier.align(Alignment.TopCenter).padding(top = 60.dp).padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(info.peerName, color = Color.White, style = MaterialTheme.typography.headlineLarge)
            Text(
                text = when {
                    state is CallState.Outgoing -> "Вызов…"
                    isOutgoing                  -> "Вызов…"
                    else -> "%d:%02d".format(elapsed / 60, elapsed % 60)
                },
                color = Color.White.copy(alpha = 0.7f),
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        // Local video preview (только для video)
        if (info.type == CallType.Video && localTrack != null) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 60.dp, end = 16.dp)
                    .size(110.dp, 150.dp)
                    .shadow(14.dp, RoundedCornerShape(16.dp))
                    .clip(RoundedCornerShape(16.dp))
                    .border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(16.dp)),
            ) {
                VideoRenderer(track = localTrack, eglBase = egl, mirror = true, modifier = Modifier.fillMaxSize())
            }
        }

        // Controls
        Row(
            Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 40.dp)
                .padding(horizontal = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp, alignment = Alignment.CenterHorizontally),
        ) {
            CtrlButton(
                icon = if (muted) Icons.Filled.MicOff else Icons.Filled.Mic,
                active = muted,
            ) { CallManager.toggleMute() }

            if (info.type == CallType.Video) {
                CtrlButton(
                    icon = if (videoOff) Icons.Filled.VideocamOff else Icons.Filled.Videocam,
                    active = videoOff,
                ) { CallManager.toggleVideo() }
                CtrlButton(icon = Icons.Filled.FlipCameraAndroid) { CallManager.switchCamera() }
            } else {
                CtrlButton(
                    icon = Icons.Filled.VolumeUp,
                    active = speaker,
                ) { CallManager.toggleSpeaker() }
            }

            EndCallButton { CallManager.endCurrent() }
        }
    }
}

@Composable
private fun CtrlButton(icon: ImageVector, active: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(if (active) Color.White else Color.White.copy(alpha = 0.15f))
            .border(1.dp, Color.White.copy(alpha = 0.1f), CircleShape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (active) Color.Black else Color.White,
            modifier = Modifier.size(22.dp),
        )
    }
}

@Composable
private fun EndCallButton(onClick: () -> Unit) {
    Box(
        Modifier
            .size(68.dp)
            .shadow(18.dp, CircleShape, ambientColor = DakkaColor.Danger, spotColor = DakkaColor.Danger)
            .clip(CircleShape)
            .background(DakkaColor.Danger)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.CallEnd, "End", tint = Color.White, modifier = Modifier.size(28.dp))
    }
}
