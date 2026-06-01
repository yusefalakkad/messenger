package online.akkdmsg.dakka.ui.theme

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/** Брендовые градиенты — нативные Compose Brush'ы. */
object Brand {

    /** Основной диагональный градиент violet → fuchsia → pink → orange. */
    val gradient: Brush = Brush.linearGradient(
        colors = listOf(
            DakkaColor.Violet,
            DakkaColor.Fuchsia,
            DakkaColor.Pink,
            DakkaColor.Orange,
        )
    )

    /** Чуть мягче — для текста-акцента ("dakka" в шапке). */
    val textGradient: Brush = Brush.linearGradient(
        colors = listOf(
            DakkaColor.Pink,
            DakkaColor.Fuchsia,
            DakkaColor.Violet,
            DakkaColor.Orange,
        ),
        start = Offset.Zero,
        end = Offset.Infinite,
    )

    /** Тонкий glass-fill для карточек. */
    val glassCard: Brush = Brush.verticalGradient(
        colors = listOf(
            Color.White.copy(alpha = 0.05f),
            Color.White.copy(alpha = 0.015f),
        )
    )
}
