package online.akkdmsg.dakka.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import online.akkdmsg.dakka.data.MediaInfo
import online.akkdmsg.dakka.ui.theme.DakkaColor

@Composable
fun ImageMessageView(media: MediaInfo, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .widthIn(max = 260.dp)
            .heightIn(max = 320.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color.White.copy(alpha = 0.04f)),
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(
            model = media.url,
            contentDescription = "Фото",
            contentScale = ContentScale.Fit,
            modifier = Modifier.clip(RoundedCornerShape(10.dp)),
        )
    }
}
