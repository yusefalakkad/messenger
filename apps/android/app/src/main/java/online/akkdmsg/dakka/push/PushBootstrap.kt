package online.akkdmsg.dakka.push

import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * После логина вызываем PushBootstrap.requestAndRegisterToken() —
 * получаем актуальный FCM token и шлём на бэк.
 *
 * Не падает если FCM не сконфигурирован (google-services.json отсутствует) —
 * просто молча скипает.
 */
object PushBootstrap {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun requestAndRegisterToken() {
        scope.launch {
            val token = runCatching { fetchToken() }.getOrNull() ?: return@launch
            TokenRegistrar.register(token)
        }
    }

    private suspend fun fetchToken(): String? = suspendCancellableCoroutine { cont ->
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token -> cont.resume(token) }
            .addOnFailureListener { _ -> cont.resume(null) }
    }
}
