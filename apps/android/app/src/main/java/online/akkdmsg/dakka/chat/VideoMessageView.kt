package online.akkdmsg.dakka.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import online.akkdmsg.dakka.data.MediaInfo
import online.akkdmsg.dakka.ui.theme.Brand

/**
 * Прямоугольное полноразмерное видео-сообщение в чате.
 * • Превью + кнопка play
 * • Тап → полноэкранный плеер с системными контролами (Media3 PlayerView)
 * • В чате — не автоплей, тап на превью открывает плеер
 *
 * НЕ заменяет CirclePlayerView (тот для круглых кружков).
 */
@Composable
fun VideoMessageView(media: MediaInfo, modifier: Modifier = Modifier) {
    var showPlayer by remember { mutableStateOf(false) }

    Box(
        modifier = modifier
            .widthIn(max = 260.dp)
            .heightIn(max = 340.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.06f))
            .border(1.dp, Brand.gradient, RoundedCornerShape(12.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) { showPlayer = true },
        contentAlignment = Alignment.Center,
    ) {
        // Постер или серая заглушка
        if (!media.thumbnailUrl.isNullOrBlank()) {
            AsyncImage(
                model = media.thumbnailUrl,
                contentDescription = "Видео",
                modifier = Modifier
                    .widthIn(max = 260.dp)
                    .heightIn(max = 340.dp)
                    .clip(RoundedCornerShape(12.dp)),
            )
        } else {
            // 4:3 placeholder
            Box(
                Modifier
                    .size(width = 240.dp, height = 180.dp)
                    .background(Color.White.copy(alpha = 0.05f))
            )
        }

        // Затемнение + play overlay
        Box(
            Modifier
                .matchParentSize()
                .background(Color.Black.copy(alpha = 0.25f)),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.5f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.PlayArrow, null,
                    tint = Color.White,
                    modifier = Modifier.size(30.dp),
                )
            }
        }

        // Длительность снизу-справа
        media.duration?.takeIf { it > 0 }?.let { d ->
            val total = d.toInt()
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(8.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color.Black.copy(alpha = 0.65f))
                    .padding(horizontal = 6.dp, vertical = 3.dp),
            ) {
                Text(
                    text = "%d:%02d".format(total / 60, total % 60),
                    color = Color.White,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
    }

    if (showPlayer) {
        VideoFullscreenPlayer(url = media.url, onClose = { showPlayer = false })
    }
}

@Composable
private fun VideoFullscreenPlayer(url: String, onClose: () -> Unit) {
    val context = LocalContext.current
    val player = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            repeatMode = Player.REPEAT_MODE_OFF
            playWhenReady = true
            prepare()
        }
    }
    DisposableEffect(player) {
        onDispose { player.release() }
    }

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
        ),
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AndroidView(
                factory = {
                    PlayerView(it).apply {
                        this.player = player
                        useController = true
                        setShutterBackgroundColor(android.graphics.Color.BLACK)
                        resizeMode = androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 40.dp, end = 16.dp)
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.18f))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onClose() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Close, "Закрыть", tint = Color.White, modifier = Modifier.size(18.dp))
            }
        }
    }
}

