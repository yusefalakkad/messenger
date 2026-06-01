import Foundation
import PushKit
import CallKit

/// PushKit (VoIP push) — главное отличие от обычных APNs:
/// • Срабатывает даже когда приложение убито
/// • iOS будит приложение, мы получаем payload и ОБЯЗАНЫ
///   немедленно вызвать reportNewIncomingCall, иначе iOS оштрафует
///
/// VoIP-токен берётся отдельно от обычного APNs-токена.
/// Отправляем на /push/voip-token бэкенду.
final class PushKitManager: NSObject {
    static let shared = PushKitManager()

    private let registry = PKPushRegistry(queue: .main)

    private override init() {
        super.init()
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
    }

    /// Вызвать один раз при старте приложения.
    func start() {
        // Регистрация уже выполняется в init через desiredPushTypes.
        // Метод служит точкой явного запуска (linker, чтобы не выкосило singleton).
        _ = registry.pushToken(for: .voIP)
    }
}

// MARK: - PKPushRegistryDelegate

extension PushKitManager: PKPushRegistryDelegate {

    func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        Task {
            do {
                struct Body: Codable { let token: String; let platform: String }
                let _: Empty = try await APIClient.shared.post(
                    "push/voip-token",
                    body: Body(token: token, platform: "ios")
                )
                print("[PushKit] VoIP token registered")
            } catch {
                print("[PushKit] VoIP token register failed:", error)
            }
        }
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        // Токен инвалидирован — можно сообщить бэкенду чтобы почистил.
        print("[PushKit] VoIP token invalidated")
    }

    /// КРИТИЧНО: должны вызвать reportNewIncomingCall в ЛЮБОМ случае.
    /// Даже если payload поврежден / звонок устарел — рапортуем и сразу заканчиваем.
    func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }

        let dict = payload.dictionaryPayload
        let callId     = dict["callId"]   as? String ?? UUID().uuidString
        let chatId     = dict["chatId"]   as? String ?? ""
        let callerId   = dict["callerId"] as? String ?? ""
        let callerName = dict["callerName"] as? String ?? "Входящий вызов"
        let callerAvatar = dict["callerAvatar"] as? String
        let callTypeRaw = dict["callType"] as? String ?? "audio"
        let callType = CallType(rawValue: callTypeRaw) ?? .audio

        Task { @MainActor in
            // 1. ОБЯЗАТЕЛЬНО репортуем в CallKit (иначе iOS оштрафует)
            CallKitProvider.shared.reportIncoming(
                callId: callId,
                callerName: callerName,
                hasVideo: callType == .video
            )

            // 2. Также эмитим событие в наш CallManager — чтобы он подготовил
            // WebRTC-стек к моменту когда юзер тапнет "Принять"
            SocketClient.shared.callIncoming.send(
                IncomingCallEvent(
                    callId: callId,
                    chatId: chatId,
                    callerId: callerId,
                    callerName: callerName,
                    callerAvatar: callerAvatar,
                    callType: callType
                )
            )
            completion()
        }
    }
}
