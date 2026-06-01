import Foundation
import CallKit
import AVFoundation
import Combine

/// CallKit-обёртка: репортит входящие звонки в систему,
/// обрабатывает действия (answer/end) от системного UI,
/// синхронизирует AVAudioSession с CallKit'ом.
@MainActor
final class CallKitProvider: NSObject {
    static let shared = CallKitProvider()

    private let provider: CXProvider
    private let callController = CXCallController()

    /// Активные UUID звонков (callId iOS приложения ↔ UUID для CallKit).
    private var activeCallIds: [UUID: String] = [:]

    private override init() {
        let config = CXProviderConfiguration()
        config.supportsVideo = true
        config.maximumCallGroups = 1
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = true
        if let iconData = UIImage(named: "AppIcon")?.pngData() {
            config.iconTemplateImageData = iconData
        }
        // Ringtone name: можно указать .caf файл в bundle. По умолчанию системный.
        // config.ringtoneSound = "ringtone.caf"
        self.provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: .main)
    }

    // MARK: - Public API

    /// Репортит входящий звонок в систему. ВЫЗЫВАТЬ ВСЕГДА при получении VoIP-push,
    /// иначе iOS оштрафует приложение (отключит VoIP пуши).
    func reportIncoming(callId: String, callerName: String, hasVideo: Bool, completion: ((Error?) -> Void)? = nil) {
        let uuid = UUID()
        activeCallIds[uuid] = callId

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: callerName)
        update.localizedCallerName = callerName
        update.hasVideo = hasVideo
        update.supportsHolding = false
        update.supportsDTMF = false
        update.supportsGrouping = false
        update.supportsUngrouping = false

        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error {
                print("[CallKit] reportNewIncomingCall failed:", error)
            }
            completion?(error)
        }
    }

    /// Сообщает CallKit что мы запустили исходящий звонок.
    func startOutgoing(callId: String, calleeName: String, hasVideo: Bool) {
        let uuid = UUID()
        activeCallIds[uuid] = callId

        let handle = CXHandle(type: .generic, value: calleeName)
        let action = CXStartCallAction(call: uuid, handle: handle)
        action.isVideo = hasVideo
        let transaction = CXTransaction(action: action)
        callController.request(transaction) { err in
            if let err { print("[CallKit] start outgoing failed:", err) }
        }
    }

    /// Сообщает CallKit что мы завершаем звонок (с нашей стороны).
    func endCallFromApp(callId: String) {
        guard let uuid = activeCallIds.first(where: { $0.value == callId })?.key else { return }
        let action = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: action)
        callController.request(transaction) { _ in }
        activeCallIds.removeValue(forKey: uuid)
    }

    /// Звонок был принят/отвергнут другой стороной — сообщаем CallKit.
    func reportConnected(callId: String) {
        guard let uuid = activeCallIds.first(where: { $0.value == callId })?.key else { return }
        provider.reportOutgoingCall(with: uuid, connectedAt: nil)
    }

    func reportRemoteEnded(callId: String, reason: CXCallEndedReason = .remoteEnded) {
        guard let uuid = activeCallIds.first(where: { $0.value == callId })?.key else { return }
        provider.reportCall(with: uuid, endedAt: nil, reason: reason)
        activeCallIds.removeValue(forKey: uuid)
    }
}

// MARK: - CXProviderDelegate

extension CallKitProvider: CXProviderDelegate {

    nonisolated func providerDidReset(_ provider: CXProvider) {
        Task { @MainActor in
            self.activeCallIds.removeAll()
            CallManager.shared.endCurrent(reason: "reset")
        }
    }

    /// Пользователь нажал «Принять» в системном UI.
    nonisolated func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        Task { @MainActor in
            CallManager.shared.acceptIncoming()
            action.fulfill()
        }
    }

    /// Пользователь нажал «Завершить» в системном UI.
    nonisolated func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        Task { @MainActor in
            if self.activeCallIds[action.callUUID] != nil {
                self.activeCallIds.removeValue(forKey: action.callUUID)
                CallManager.shared.endCurrent(reason: "user-ended")
            }
            action.fulfill()
        }
    }

    /// Mute toggle из системного UI.
    nonisolated func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        Task { @MainActor in
            CallManager.shared.toggleMute()
            action.fulfill()
        }
    }

    /// CallKit активирует AVAudioSession — мы должны просто принять.
    nonisolated func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // WebRTC сам конфигурирует RTCAudioSession при старте звонка
        print("[CallKit] audio session activated")
    }

    nonisolated func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        print("[CallKit] audio session deactivated")
    }
}

#if canImport(UIKit)
import UIKit
#endif
