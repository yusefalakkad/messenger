package online.akkdmsg.dakka.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import online.akkdmsg.dakka.ui.theme.DakkaColor

/**
 * Глубокий фиолетово-чёрный фон с парящими градиентными засветками.
 * Точная копия web/iOS-варианта.
 */
@Composable
fun AmbientBackground(modifier: Modifier = Modifier) {
    var phase by remember { mutableStateOf(0f) }
    LaunchedEffect(Unit) {
        // Лёгкая медленная анимация — пятна "дышат"
        while (true) {
            delay(50)
            phase += 0.01f
        }
    }

    Box(modifier = modifier.fillMaxSize().background(DakkaColor.Bg)) {
        // Top-left violet glow
        Box(
            Modifier
                .offset(x = (-100).dp, y = (-120).dp)
                .size(420.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            DakkaColor.Violet.copy(alpha = 0.30f),
                            DakkaColor.Bg.copy(alpha = 0f),
                        )
                    )
                )
                .blur(80.dp)
        )
        // Bottom-right pink glow
        Box(
            Modifier
                .offset(x = 220.dp, y = 480.dp)
                .size(420.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            DakkaColor.Pink.copy(alpha = 0.22f),
                            DakkaColor.Bg.copy(alpha = 0f),
                        )
                    )
                )
                .blur(80.dp)
        )
        // Center subtle orange
        Box(
            Modifier
                .offset(x = 100.dp, y = 300.dp)
                .size(280.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            DakkaColor.Orange.copy(alpha = 0.10f),
                            DakkaColor.Bg.copy(alpha = 0f),
                        )
                    )
                )
                .blur(60.dp)
        )
    }
}
