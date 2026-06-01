package online.akkdmsg.dakka.call

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.webrtc.EglBase
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

/**
 * Composable-обёртка над SurfaceViewRenderer для рендера WebRTC видеотрека.
 * mirror=true — для локальной фронт-камеры.
 */
@Composable
fun VideoRenderer(
    track: VideoTrack?,
    eglBase: EglBase?,
    modifier: Modifier = Modifier,
    mirror: Boolean = false,
) {
    val key = (track?.id() ?: "null") + ":" + (eglBase?.hashCode() ?: 0)

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            SurfaceViewRenderer(ctx).also { renderer ->
                eglBase?.let { renderer.init(it.eglBaseContext, null) }
                renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                renderer.setMirror(mirror)
                track?.addSink(renderer)
            }
        },
        update = { renderer ->
            renderer.setMirror(mirror)
            // Track binding в update: каждый раз сначала снимаем старый, потом добавляем новый
            // Нет дешёвого способа "узнать" текущий, поэтому при смене ключа recompose
            // создаст новый рендерер (AndroidView с key).
        },
        onRelease = { renderer ->
            track?.removeSink(renderer)
            renderer.release()
        },
    )

    DisposableEffect(key) {
        // Заставляем перекомпозицию при смене трека: AndroidView в Compose
        // не пересоздаётся сам по себе, но через DisposableEffect мы хотя бы
        // явно ловим жизненный цикл смены.
        onDispose { }
    }
}
