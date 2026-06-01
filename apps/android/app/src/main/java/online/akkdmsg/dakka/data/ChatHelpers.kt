package online.akkdmsg.dakka.data

fun Chat.otherMember(currentUserId: String?): ChatMember? =
    members.firstOrNull { it.userId != currentUserId }

fun Chat.displayName(currentUserId: String?): String =
    if (type == "group") name.orEmpty()
    else otherMember(currentUserId)?.user?.displayName ?: "—"

fun Chat.displayAvatar(currentUserId: String?): String? =
    if (type == "group") avatar
    else otherMember(currentUserId)?.user?.avatar

fun Chat.isOnline(currentUserId: String?): Boolean =
    type == "direct" && otherMember(currentUserId)?.user?.status == "online"

/** E2E включено в direct-чате если у обоих участников есть publicKey. */
val Chat.isE2E: Boolean
    get() = type == "direct" && members.all { !it.user.publicKey.isNullOrBlank() }
