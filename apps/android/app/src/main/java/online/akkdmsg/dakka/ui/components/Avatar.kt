package online.akkdmsg.dakka.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import online.akkdmsg.dakka.ui.theme.DakkaColor

/** Стабильный цвет по имени — для аватаров без фото. */
private val AvatarColors = listOf(
    Color(0xFFEF4444), Color(0xFFEC4899), Color(0xFFD946EF), Color(0xFF8B5CF6),
    Color(0xFF6366F1), Color(0xFF3B82F6), Color(0xFF06B6D4), Color(0xFF14B8A6),
    Color(0xFF10B981), Color(0xFF22C55E), Color(0xFFEAB308), Color(0xFFF97316),
)

private fun nameToColor(name: String): Color {
    var hash = 0
    for (ch in name) hash = (hash * 31 + ch.code) or 0
    return AvatarColors[kotlin.math.abs(hash) % AvatarColors.size]
}

@Composable
fun Avatar(
    url: String?,
    name: String,
    modifier: Modifier = Modifier,
    size: Int = 40,
    online: Boolean? = null,
) {
    val initials = remember(name) {
        name.trim().split(" ").take(2).joinToString("") { it.firstOrNull()?.toString().orEmpty() }.uppercase()
    }
    val bgColor = remember(name) { nameToColor(name) }

    Box(modifier = modifier.size(size.dp)) {
        Box(
            Modifier
                .size(size.dp)
                .clip(CircleShape)
                .background(bgColor),
            contentAlignment = Alignment.Center,
        ) {
            if (!url.isNullOrBlank()) {
                AsyncImage(
                    model = url,
                    contentDescription = name,
                    modifier = Modifier.size(size.dp).clip(CircleShape),
                )
            } else {
                Text(
                    text = initials.ifEmpty { "?" },
                    color = Color.White,
                    fontSize = (size * 0.4).sp,
                    style = MaterialTheme.typography.titleMedium,
                )
            }
        }
        if (online != null) {
            Box(
                Modifier
                    .size((size * 0.28).dp)
                    .align(Alignment.BottomEnd)
                    .clip(CircleShape)
                    .background(if (online) DakkaColor.Online else Color.White.copy(alpha = 0.25f))
                    .border(2.dp, DakkaColor.Bg, CircleShape),
            )
        }
    }
}

