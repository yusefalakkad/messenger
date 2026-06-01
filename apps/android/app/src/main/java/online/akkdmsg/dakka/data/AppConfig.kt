package online.akkdmsg.dakka.data

import online.akkdmsg.dakka.BuildConfig

/**
 * Конфигурация приложения. URL'ы можно переопределить через BuildConfig flavors
 * или Gradle properties в будущем.
 */
object AppConfig {
    /** REST API base URL (без trailing slash). */
    const val API_BASE_URL: String = "https://akkdmsg.online/api"

    /** WebSocket base — без /socket.io/, socket.io-client сам добавит. */
    const val SOCKET_BASE_URL: String = "https://akkdmsg.online"

    /** Версия для User-Agent header. */
    val versionName: String = BuildConfig.VERSION_NAME
}
