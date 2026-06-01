package online.akkdmsg.dakka.util

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context

/**
 * Копирует строку в буфер обмена.
 *
 * Если [sensitive] = true и устройство на Android 13+ (Tiramisu), системе помечается
 * `IS_SENSITIVE`-флаг: содержимое не показывается в превью, не подсвечивается
 * системными лаунчерами/keyboard-ами и т.д. Используется для recovery-кодов,
 * TOTP-секретов и текста сообщений мессенджера.
 */
fun Context.copyToClipboard(
    text: String,
    label: String = "Dakka",
    sensitive: Boolean = true,
) {
    val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val clip = ClipData.newPlainText(label, text)
    if (sensitive &&
        android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU
    ) {
        clip.description.extras = android.os.PersistableBundle().apply {
            putBoolean("android.content.extra.IS_SENSITIVE", true)
        }
    }
    cm.setPrimaryClip(clip)
}
