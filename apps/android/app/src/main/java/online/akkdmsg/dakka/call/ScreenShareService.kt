package online.akkdmsg.dakka.call

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import online.akkdmsg.dakka.MainActivity
import online.akkdmsg.dakka.R

/**
 * Foreground-сервис, необходимый Android 14+ для удержания MediaProjection.
 * Сервис не делает захват сам — он лишь держит лайв-уведомление, пока
 * [ScreenCapturerAndroid] активен. Capture-логика живёт в [WebRTCManager].
 *
 * Запуск:  startForegroundService(Intent(ctx, ScreenShareService::class.java))
 * Стоп:    stopService(...) либо stopSelf() из самого сервиса.
 */
class ScreenShareService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureChannel()
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher_foreground)
            .setContentTitle("Показ экрана")
            .setContentText("Идёт демонстрация экрана в звонке Dakka")
            .setOngoing(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        return START_NOT_STICKY
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        mgr.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Показ экрана",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Активный показ экрана во время звонка"
                setShowBadge(false)
            },
        )
    }

    companion object {
        const val CHANNEL_ID = "screen_share"
        const val NOTIFICATION_ID = 4242

        fun start(ctx: Context) {
            val intent = Intent(ctx, ScreenShareService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent)
            } else {
                ctx.startService(intent)
            }
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, ScreenShareService::class.java))
        }
    }
}
