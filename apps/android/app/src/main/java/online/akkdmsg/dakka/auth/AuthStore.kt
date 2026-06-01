package online.akkdmsg.dakka.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import online.akkdmsg.dakka.data.User
import online.akkdmsg.dakka.data.api.ApiClient

/**
 * Хранение JWT и юзера в EncryptedSharedPreferences (AES-256-GCM с ключом из Keystore).
 * Reactive state через StateFlow — Compose подписывается через collectAsState.
 */
class AuthStore private constructor(context: Context) {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "dakka_auth",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private val json = Json { ignoreUnknownKeys = true }

    private val _user = MutableStateFlow<User?>(loadUser())
    val user: StateFlow<User?> = _user.asStateFlow()

    val isAuthenticated: Boolean get() = _user.value != null

    init {
        // Восстанавливаем токен в ApiClient при старте
        ApiClient.accessToken = prefs.getString(KEY_TOKEN, null)
    }

    fun setAuth(user: User, accessToken: String, privateKey: String? = null) {
        prefs.edit().apply {
            putString(KEY_USER, json.encodeToString(User.serializer(), user))
            putString(KEY_TOKEN, accessToken)
            if (privateKey != null) putString(KEY_PRIVATE_KEY, privateKey)
            apply()
        }
        ApiClient.accessToken = accessToken
        _user.value = user
    }

    val privateKey: String? get() = prefs.getString(KEY_PRIVATE_KEY, null)

    fun logout() {
        prefs.edit()
            .remove(KEY_USER)
            .remove(KEY_TOKEN)
            // Приватный ключ оставляем — нужен для расшифровки старых сообщений при повторном логине
            .apply()
        ApiClient.accessToken = null
        _user.value = null
    }

    private fun loadUser(): User? {
        val raw = prefs.getString(KEY_USER, null) ?: return null
        return runCatching { json.decodeFromString(User.serializer(), raw) }.getOrNull()
    }

    companion object {
        private const val KEY_USER = "user"
        private const val KEY_TOKEN = "access_token"
        private const val KEY_PRIVATE_KEY = "private_key"

        @Volatile
        private var INSTANCE: AuthStore? = null

        fun get(context: Context): AuthStore =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: AuthStore(context.applicationContext).also { INSTANCE = it }
            }
    }
}
