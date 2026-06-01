import UIKit

/// Помощник для копирования чувствительных данных (recovery-коды, TOTP-секреты,
/// текст E2E-сообщений и т.п.) в системный буфер обмена с автоматическим
/// истечением и без синхронизации через Universal Clipboard.
enum SensitiveClipboard {
    /// Копирует `text`. По умолчанию пасstebuffer самоочищается через 60 секунд
    /// и не синхронизируется на другие устройства Apple ID.
    static func copy(_ text: String, expiresIn: TimeInterval = 60) {
        UIPasteboard.general.setItems(
            [[UIPasteboard.typeAutomatic: text]],
            options: [
                .expirationDate: Date().addingTimeInterval(expiresIn),
                .localOnly: true,
            ]
        )
    }
}
