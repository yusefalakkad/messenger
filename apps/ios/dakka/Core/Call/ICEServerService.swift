import Foundation
import WebRTC

/// Получение ICE-серверов (STUN + TURN) с бэкенда.
/// Пароль TURN не зашит в бинарь — раздаётся через защищённый endpoint.
enum ICEServerService {

    private struct Server: Decodable {
        let urls: [String]
        let username: String?
        let credential: String?
    }
    private struct Resp: Decodable {
        let iceServers: [Server]
    }

    /// Запрашивает и возвращает массив RTCIceServer.
    /// Fallback: при сетевой ошибке отдаём только Google STUN.
    static func fetch() async -> [RTCIceServer] {
        do {
            let resp: Resp = try await APIClient.shared.get("webrtc/ice-servers")
            return resp.iceServers.map { s in
                if let user = s.username, let cred = s.credential {
                    return RTCIceServer(
                        urlStrings: s.urls,
                        username: user,
                        credential: cred
                    )
                }
                return RTCIceServer(urlStrings: s.urls)
            }
        } catch {
            print("[ICE] fetch failed, using fallback:", error)
            return [
                RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"]),
            ]
        }
    }
}
