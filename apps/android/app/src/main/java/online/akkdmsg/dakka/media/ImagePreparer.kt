package online.akkdmsg.dakka.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import kotlin.math.min

object ImagePreparer {

    data class Prepared(
        val file: File,
        val mimeType: String = "image/jpeg",
        val fileName: String = "image.jpg",
        val width: Int,
        val height: Int,
    )

    /**
     * Из content:// URI готовит JPEG ≤ 2048px по большей стороне,
     * quality 85, в cacheDir.
     */
    suspend fun fromUri(context: Context, uri: Uri): Prepared? = withContext(Dispatchers.IO) {
        val input = context.contentResolver.openInputStream(uri) ?: return@withContext null
        val raw = input.use { it.readBytes() }

        val bmp = BitmapFactory.decodeByteArray(raw, 0, raw.size) ?: return@withContext null
        val maxSide = 2048
        val scale = min(1.0, maxSide.toDouble() / maxOf(bmp.width, bmp.height))
        val resized = if (scale < 1.0) {
            Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true)
        } else bmp

        val out = File(context.cacheDir, "img-${System.currentTimeMillis()}.jpg")
        FileOutputStream(out).use {
            resized.compress(Bitmap.CompressFormat.JPEG, 85, it)
        }
        if (resized !== bmp) resized.recycle()
        bmp.recycle()

        Prepared(file = out, width = resized.width, height = resized.height)
    }
}
