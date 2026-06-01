package online.akkdmsg.dakka.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import online.akkdmsg.dakka.ui.theme.Brand
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun MessageInput(
    text: String,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val hasText = text.isNotBlank()
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(DakkaColor.Surface.copy(alpha = 0.85f))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Input
        Box(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(24.dp))
                .background(Color.White.copy(alpha = 0.04f))
                .border(
                    1.dp,
                    if (focused) DakkaColor.Violet.copy(alpha = 0.5f) else Color.White.copy(alpha = 0.07f),
                    RoundedCornerShape(24.dp),
                )
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            BasicTextField(
                value = text,
                onValueChange = onTextChange,
                singleLine = false,
                maxLines = 5,
                cursorBrush = SolidColor(DakkaColor.Violet),
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.White),
                interactionSource = interactionSource,
                modifier = Modifier.fillMaxWidth(),
            )
            if (text.isEmpty()) {
                Text(
                    text = "Сообщение…",
                    color = Color.White.copy(alpha = 0.3f),
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }

        // Send button
        AnimatedVisibility(
            visible = hasText,
            enter = scaleIn(),
            exit = scaleOut(),
        ) {
            Box(
                Modifier
                    .size(44.dp)
                    .shadow(
                        elevation = 14.dp,
                        shape = CircleShape,
                        ambientColor = DakkaColor.Violet,
                        spotColor = DakkaColor.Violet,
                    )
                    .clip(CircleShape)
                    .background(Brand.gradient)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = onSend,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Send, contentDescription = "Send", tint = Color.White, modifier = Modifier.size(18.dp))
            }
        }
    }
}
