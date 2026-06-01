package online.akkdmsg.dakka.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import online.akkdmsg.dakka.data.MediaInfo
import online.akkdmsg.dakka.media.AudioPlayer
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor
import kotlin.math.max
import kotlin.math.sin

@Composable
fun VoicePlayerView(
    media: MediaInfo,
    isOwn: Boolean,
    modifier: Modifier = Modifier,
) {
    val currentUrl by AudioPlayer.currentUrl.collectAsState()
    val isPlaying by AudioPlayer.isPlaying.collectAsState()
    val progress by AudioPlayer.progress.collectAsState()

    val isMine = currentUrl == media.url
    val playing = isMine && isPlaying
    val curProgress = if (isMine) progress else 0f

    val waveform: List<Float> = remember(media.waveform) {
        media.waveform?.map { it.toFloat() }
            ?: List(32) { i -> 0.3f + 0.5f * sin(i * 0.4f) }
    }

    val totalSec: Int = (media.duration?.toInt()) ?: 0
    val playedSec = (totalSec * curProgress).toInt()
    val timeLabel = if (playing) "%d:%02d".format(playedSec / 60, playedSec % 60)
                    else         "%d:%02d".format(totalSec / 60, totalSec % 60)

    Row(
        modifier = modifier
            .padding(vertical = 2.dp)
            .widthIn(min = 180.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Play button
        Box(
            Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(if (isOwn) Color.White.copy(alpha = 0.22f) else Brand.gradient)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { AudioPlayer.toggle(media.url) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(18.dp),
            )
        }

        // Waveform
        Row(
            modifier = Modifier.weight(1f).height(28.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val filledCount = (waveform.size * curProgress).toInt()
            waveform.forEachIndexed { i, h ->
                Box(
                    Modifier
                        .weight(1f)
                        .height(max(3.dp, (h * 26).dp))
                        .clip(RoundedCornerShape(2.dp))
                        .background(
                            if (i < filledCount) {
                                if (isOwn) Color.White else DakkaColor.Violet
                            } else {
                                if (isOwn) Color.White.copy(alpha = 0.35f) else Color.White.copy(alpha = 0.25f)
                            }
                        )
                )
            }
        }

        Text(
            text = timeLabel,
            color = if (isOwn) Color.White.copy(alpha = 0.85f) else Color.White.copy(alpha = 0.55f),
            style = MaterialTheme.typography.labelSmall,
        )
    }
}
