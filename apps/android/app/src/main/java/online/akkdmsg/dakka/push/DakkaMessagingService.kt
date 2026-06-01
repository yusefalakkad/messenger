package online.akkdmsg.dakka.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import online.akkdmsg.dakka.MainActivity
import online.akkdmsg.dakka.R
import online.akkdmsg.dakka.data.api.ApiClient

/**
 * FCM приёмник: получает push-уведомления и обрабатывает регистрацию токена.
 *
 * Backend шлёт минимальный payload {"chatId": "..."} (sealed-sender-lite —
 * без имени и текста, чтобы не утекали метаданные через Google Push).
 * Имя/текст подтягивается клиентом при открытии чата.
 */
class DakkaMessagingService : FirebaseMessagingService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        // Регистрируем токен на бэкенде когда юзер залогинен.
        // Если accessToken пуст — токен зашлём позже из AuthStore при логине.
        scope.launch { TokenRegistrar.register(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val chatId = message.data["chatId"] ?: return
        val title = message.notification?.title ?: message.data["title"] ?: "Новое сообщение"
        val body  = message.notification?.body  ?: message.data["body"]  ?: ""
        showNotification(this, chatId, title, body)
    }

    private fun showNotification(context: Context, chatId: String, title: String, body: String) {
        val nm = context.getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_MESSAGES, "Сообщения", NotificationManager.IMPORTANCE_HIGH
            ).apply { description = "Push-уведомления о новых сообщениях" }
            nm.createNotificationChannel(channel)
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("chatId", chatId)
        }
        val pi = PendingIntent.getActivity(
            context, chatId.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notif = NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.mipmap.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        nm.notify(chatId.hashCode(), notif)
    }

    companion object {
        const val CHANNEL_MESSAGES = "messages"
    }
}

/** Шлёт FCM-токен на бэкенд POST /push/native-token. */
object TokenRegistrar {

    @Serializable
    private data class Body(val token: String, val platform: String = "android")

    @Serializable
    private data class Empty(val ok: Boolean? = null)

    suspend fun register(token: String) {
        // Если юзер не залогинен — ApiClient.accessToken == null и запрос
        // вернётся 401. Это ОК — повторим при следующем onCreate
        // (FirebaseMessaging.getInstance().token).
        if (ApiClient.accessToken == null) return
        runCatching {
            ApiClient.post<Body, Empty>(
                path = "push/native-token",
                body = Body(token),
            )
        }
    }
}
