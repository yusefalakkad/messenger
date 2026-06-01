package online.akkdmsg.dakka.data.api

import online.akkdmsg.dakka.data.User

object UserApi {
    /** Поиск пользователей по @username / displayName. */
    suspend fun search(query: String): List<User> =
        ApiClient.get("users/search", query = mapOf("q" to query))
}
