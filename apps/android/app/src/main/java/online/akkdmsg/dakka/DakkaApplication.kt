package online.akkdmsg.dakka

import android.app.Application
import online.akkdmsg.dakka.auth.AuthStore
import online.akkdmsg.dakka.call.CallManager

class DakkaApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Прогреваем AuthStore — он восстановит токен в ApiClient при старте
        AuthStore.get(this)
        // CallManager подписывается на socket → готов принять входящие
        CallManager.init(this)
    }
}
