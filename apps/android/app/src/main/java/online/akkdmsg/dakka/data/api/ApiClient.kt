package online.akkdmsg.dakka.data.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import online.akkdmsg.dakka.data.ApiEnvelope
import online.akkdmsg.dakka.data.AppConfig
import java.util.concurrent.TimeUnit

/**
 * Тонкий API-клиент поверх OkHttp + kotlinx.serialization.
 * Без Retrofit, чтобы держать зависимости минимальными.
 */
object ApiClient {

    val json: Json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        encodeDefaults = true
    }

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    /** Bearer-токен — пишется AuthStore'ом. */
    @Volatile
    var accessToken: String? = null

    class ApiException(val statusCode: Int, message: String) : RuntimeException(message)

    suspend inline fun <reified T> get(
        path: String,
        query: Map<String, String> = emptyMap(),
        requireAuth: Boolean = true,
    ): T = request(
        method = "GET", path = path, bodyJson = null, query = query,
        requireAuth = requireAuth, serializer = serializer<T>(),
    )

    suspend inline fun <reified B, reified T> post(
        path: String,
        body: B?,
        requireAuth: Boolean = true,
    ): T {
        val bodyJson = body?.let { json.encodeToString(serializer<B>(), it) }
        return request(
            method = "POST", path = path, bodyJson = bodyJson, query = emptyMap(),
            requireAuth = requireAuth, serializer = serializer<T>(),
        )
    }

    @PublishedApi
    internal suspend fun <T> request(
        method: String,
        path: String,
        bodyJson: String?,
        query: Map<String, String>,
        requireAuth: Boolean,
        serializer: KSerializer<T>,
    ): T = withContext(Dispatchers.IO) {
        val urlBuilder = "${AppConfig.API_BASE_URL.trimEnd('/')}/${path.trimStart('/')}"
            .toHttpUrl()
            .newBuilder()
        query.forEach { (k, v) -> urlBuilder.addQueryParameter(k, v) }

        val builder = Request.Builder().url(urlBuilder.build())
        if (requireAuth) {
            accessToken?.let { builder.header("Authorization", "Bearer $it") }
        }
        builder.header("Accept", "application/json")
        builder.header("User-Agent", "Dakka-Android/${AppConfig.versionName}")

        when (method) {
            "GET" -> builder.get()
            "DELETE" -> builder.delete()
            else -> builder.method(method, (bodyJson ?: "").toRequestBody(jsonMedia))
        }

        val resp = http.newCall(builder.build()).execute()
        val raw = resp.body?.string().orEmpty()
        if (!resp.isSuccessful) {
            val msg = runCatching {
                json.decodeFromString(ApiEnvelope.serializer(serializer), raw).error?.message
            }.getOrNull() ?: "HTTP ${resp.code}"
            throw ApiException(resp.code, msg)
        }
        val env = json.decodeFromString(ApiEnvelope.serializer(serializer), raw)
        env.data ?: throw ApiException(resp.code, env.error?.message ?: "Empty response")
    }
}
