import Foundation

enum AppConfig {
    /// Базовый URL API — переопределяется через `API_URL` в Info.plist при необходимости.
    static let apiBaseURL: URL = {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "API_URL") as? String,
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://akkdmsg.online/api")!
    }()

    /// Хост для socket.io (тот же origin без /api).
    static let socketBaseURL: URL = {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "SOCKET_URL") as? String,
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://akkdmsg.online")!
    }()
}
