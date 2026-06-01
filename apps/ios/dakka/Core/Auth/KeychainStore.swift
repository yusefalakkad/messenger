import Foundation
import Security

/// Минималистичный wrapper над Keychain — хранит JWT, приватный ключ E2E и т.д.
/// Все значения сохраняются с `kSecAttrAccessibleAfterFirstUnlock` —
/// доступны после первого разблокирования, выживают перезагрузки.
enum KeychainStore {
    private static let service = "online.akkdmsg.dakka"

    @discardableResult
    static func set(_ value: String, for key: String) -> Bool {
        let data = Data(value.utf8)
        delete(key) // переcоздаём чтобы избежать конфликта attr
        // Для приватного E2E-ключа усиливаем accessibility: ThisDeviceOnly →
        // ключ не уходит в iCloud Keychain и не восстановится на другом устройстве.
        let accessible: CFString = (key == Keys.privateKey)
            ? kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            : kSecAttrAccessibleAfterFirstUnlock
        let query: [String: Any] = [
            kSecClass as String:        kSecClassGenericPassword,
            kSecAttrService as String:  service,
            kSecAttrAccount as String:  key,
            kSecValueData as String:    data,
            kSecAttrAccessible as String: accessible,
        ]
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String:  true,
            kSecMatchLimit as String:  kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let str  = String(data: data, encoding: .utf8)
        else { return nil }
        return str
    }

    @discardableResult
    static func delete(_ key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        return SecItemDelete(query as CFDictionary) == errSecSuccess
    }
}

extension KeychainStore {
    enum Keys {
        static let accessToken = "accessToken"
        static let user        = "user.json"
        static let privateKey  = "e2e.privateKey"
        static let deviceId    = "deviceId"
    }
}
