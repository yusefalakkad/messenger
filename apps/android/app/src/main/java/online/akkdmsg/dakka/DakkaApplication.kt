package online.akkdmsg.dakka

import android.app.Application
import online.akkdmsg.dakka.auth.AuthStore

class DakkaApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Прогреваем AuthStore — он восстановит токен в ApiClient при старте
        AuthStore.get(this)
    }
}
