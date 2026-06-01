package online.akkdmsg.dakka.data.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import online.akkdmsg.dakka.data.ApiEnvelope
import online.akkdmsg.dakka.data.AppConfig
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Загрузка медиа на бэк через multipart/form-data.
 * Эндпоинты /media/upload/{voice|image|video|circle} возвращают
 * { url, mimeType, size, duration?, width?, height? }.
 */
object MediaService {

    @Serializable
    data class UploadedMedia(
        val url: String,
        val mimeType: String? = null,
        val size: Long? = null,
        val duration: Double? = null,
        val width: Int? = null,
        val height: Int? = null,
        val waveform: List<Double>? = null,
    )

    private val json = Json { ignoreUnknownKeys = true }

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(2, TimeUnit.MINUTES)
        .readTimeout(2, TimeUnit.MINUTES)
        .build()

    suspend fun uploadVoice(
        file: File,
        durationSec: Int,
        waveform: List<Float>,
    ): UploadedMedia = upload(
        path = "media/upload/voice",
        file = file,
        fileName = "voice.m4a",
        mimeType = "audio/mp4",
        fields = buildMap {
            put("duration", durationSec.toString())
            put("waveform", waveform.joinToString(",", "[", "]"))
        },
    )

    suspend fun uploadImage(
        file: File,
        mimeType: String = "image/jpeg",
        fileName: String = "image.jpg",
    ): UploadedMedia = upload(
        path = "media/upload/image",
        file = file,
        fileName = fileName,
        mimeType = mimeType,
        fields = emptyMap(),
    )

    suspend fun uploadCircle(
        file: File,
        durationSec: Int,
    ): UploadedMedia = upload(
        path = "media/upload/circle",
        file = file,
        fileName = "circle.mp4",
        mimeType = "video/mp4",
        fields = mapOf("duration" to durationSec.toString()),
    )

    // ── Core ────────────────────────────────────────────────────────────────

    private suspend fun upload(
        path: String,
        file: File,
        fileName: String,
        mimeType: String,
        fields: Map<String, String>,
    ): UploadedMedia = withContext(Dispatchers.IO) {

        val multipart = MultipartBody.Builder().setType(MultipartBody.FORM).apply {
            fields.forEach { (k, v) -> addFormDataPart(k, v) }
            addFormDataPart(
                name = "file",
                filename = fileName,
                body = file.asRequestBody(mimeType.toMediaType()),
            )
        }.build()

        val url = "${AppConfig.API_BASE_URL.trimEnd('/')}/${path.trimStart('/')}".toHttpUrl()
        val builder = Request.Builder().url(url).post(multipart)
        ApiClient.accessToken?.let { builder.header("Authorization", "Bearer $it") }
        builder.header("Accept", "application/json")

        val resp = http.newCall(builder.build()).execute()
        val raw = resp.body?.string().orEmpty()
        if (!resp.isSuccessful) {
            throw RuntimeException("Upload failed: HTTP ${resp.code}")
        }
        val env = json.decodeFromString(
            ApiEnvelope.serializer(UploadedMedia.serializer()),
            raw,
        )
        env.data ?: throw RuntimeException(env.error?.message ?: "Empty media response")
    }
}
