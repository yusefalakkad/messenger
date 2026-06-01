package online.akkdmsg.dakka.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
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
import online.akkdmsg.dakka.data.Reaction
import online.akkdmsg.dakka.ui.theme.DakkaColor

private val QUICK_EMOJI = listOf("❤️", "👍", "😂", "😮", "😢", "🔥")

/** Pill с быстрыми эмодзи — для bottom-sheet выбора реакции. */
@Composable
fun ReactionPicker(onPick: (String) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(DakkaColor.Surface)
            .border(1.dp, Color.White.copy(alpha = 0.08f), CircleShape)
            .padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        QUICK_EMOJI.forEach { e ->
            Box(
                Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onPick(e) },
                contentAlignment = Alignment.Center,
            ) {
                Text(e, fontSize = 22.sp)
            }
        }
    }
}

/** Группирует [Reaction]'ы по emoji и показывает chip'ы под сообщением. */
@Composable
fun ReactionsBar(
    reactions: List<Reaction>,
    currentUserId: String?,
    onToggle: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val groups = remember(reactions) {
        reactions.groupBy { it.emoji }.map { (emoji, list) ->
            Triple(emoji, list.size, list.any { it.userId == currentUserId })
        }.sortedByDescending { it.second }
    }
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        groups.forEach { (emoji, count, mine) ->
            Row(
                Modifier
                    .clip(CircleShape)
                    .background(if (mine) DakkaColor.Violet.copy(alpha = 0.25f) else Color.White.copy(alpha = 0.05f))
                    .border(
                        1.dp,
                        if (mine) DakkaColor.Violet.copy(alpha = 0.5f) else Color.White.copy(alpha = 0.07f),
                        CircleShape,
                    )
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onToggle(emoji) }
                    .padding(horizontal = 8.dp, vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(emoji, fontSize = 12.sp)
                if (count > 1) {
                    Text(
                        count.toString(),
                        color = if (mine) DakkaColor.Violet else Color.White.copy(alpha = 0.7f),
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
        }
    }
}
