package online.akkdmsg.dakka.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import online.akkdmsg.dakka.data.MediaInfo
import online.akkdmsg.dakka.ui.theme.Brand

/**
 * Видео-кружок 200×200. Тап = play (с самого начала)/pause.
 * Авто-loop через Player.REPEAT_MODE_ONE.
 */
@Composable
fun CirclePlayerView(media: MediaInfo, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var playing by remember { mutableStateOf(false) }

    val player = remember(media.url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(media.url))
            repeatMode = Player.REPEAT_MODE_ONE
            playWhenReady = false
            prepare()
            addListener(object : Player.Listener {
                override fun onIsPlayingChanged(isPlaying: Boolean) { playing = isPlaying }
            })
        }
    }

    DisposableEffect(player) {
        onDispose { player.release() }
    }

    Box(
        modifier = modifier
            .size(200.dp)
            .shadow(14.dp, CircleShape)
            .clip(CircleShape)
            .border(2.dp, Brand.gradient, CircleShape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) {
                if (player.isPlaying) player.pause() else {
                    if (player.currentPosition >= (player.duration - 50)) player.seekTo(0)
                    player.play()
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        AndroidView(
            factory = {
                PlayerView(it).apply {
                    this.player = player
                    useController = false
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    resizeMode = androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                }
            },
            modifier = Modifier.size(200.dp),
        )
        if (!playing) {
            // Превью + play overlay
            if (!media.thumbnailUrl.isNullOrBlank()) {
                AsyncImage(
                    model = media.thumbnailUrl,
                    contentDescription = null,
                    modifier = Modifier.size(200.dp).clip(CircleShape),
                )
            }
            Box(
                Modifier.size(56.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.4f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.PlayArrow, null,
                    tint = Color.White,
                    modifier = Modifier.size(28.dp),
                )
            }
        }
    }
}
