import Foundation
import Combine
import WebRTC
import AVFoundation
import UIKit

/// Высокоуровневая оркестрация звонков:
/// • WebRTCManager (peer connection)
/// • SocketClient (signaling)
/// • CallStore (UI state)
/// • permissions (mic + camera)
@MainActor
final class CallManager: ObservableObject {
    static let shared = CallManager()

    private var rtc: WebRTCManager?
    private var pendingRemoteCandidates: [RTCIceCandidate] = []
    private var hasRemoteDescription = false
    private var cancellables = Set<AnyCancellable>()

    /// Кэш ICE-серверов от бэка (STUN + TURN).
    private var cachedICEServers: [RTCIceServer]?
    /// Fallback пока кэш не подгружен.
    private static let fallbackICE: [RTCIceServer] = [
        RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"]),
    ]

    private let store = CallStore.shared

    private init() {
        wireSocket()
        // Префетчим ICE-серверы при инициализации — к моменту первого звонка
        // в кэше уже будут TURN credentials.
        Task { await refreshICEServers() }
    }

    /// Обновляет кэш ICE-серверов с бэка.
    private func refreshICEServers() async {
        cachedICEServers = await ICEServerService.fetch()
    }

    // MARK: - Public API (выбор из UI)

    /// Инициатор звонка.
    func startCall(to peer: ChatMember, in chat: Chat, type: CallType) {
        guard case .idle = store.state else { return }
        let callId = "\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(6))"
        let info = CallInfo(
            id: callId,
            chatId: chat.id,
            peerId: peer.userId,
            peerName: peer.user.displayName,
            peerAvatar: peer.user.avatar,
            type: type,
            isInitiator: true,
            startedAt: Date()
        )
        store.state = .outgoing(info)
        // CallKit: исходящий звонок в систему (для Recents и audio session)
        CallKitProvider.shared.startOutgoing(
            callId: callId, calleeName: peer.user.displayName, hasVideo: type == .video
        )
        SocketClient.shared.initiateCall(
            callId: callId, peerId: peer.userId, chatId: chat.id, callType: type
        )
        // Поднимаем WebRTC заранее — чтобы при accept сразу обмениваться offer
        setupRTC(isVideo: type == .video)
        sendOfferAfterPermission()
    }

    func acceptIncoming() {
        guard case .incoming(let info) = store.state else { return }
        Task {
            let ok = await requestPermissions(video: info.type == .video)
            guard ok else { endCurrent(reason: "no-permission"); return }
            setupRTC(isVideo: info.type == .video)
            SocketClient.shared.acceptCall(callId: info.id)
            store.state = .active(info)
            // Каллер пришлёт нам offer — мы ответим answer'ом в handleSignal()
        }
    }

    func rejectIncoming() {
        guard case .incoming(let info) = store.state else { return }
        SocketClient.shared.rejectCall(callId: info.id)
        CallKitProvider.shared.reportRemoteEnded(callId: info.id, reason: .declinedElsewhere)
        teardown()
    }

    func endCurrent(reason: String = "ended") {
        if let info = store.state.info {
            SocketClient.shared.endCall(callId: info.id)
        }
        teardown()
    }

    // MARK: - Controls

    func toggleMute() {
        store.isMuted.toggle()
        rtc?.isMuted = store.isMuted
    }

    func toggleVideo() {
        store.isVideoOff.toggle()
        rtc?.isVideoOff = store.isVideoOff
    }

    func toggleSpeaker() {
        store.isSpeakerOn.toggle()
        rtc?.setSpeakerOn(store.isSpeakerOn)
    }

    func switchCamera() {
        rtc?.switchCamera()
    }

    var localVideoTrack:  RTCVideoTrack? { rtc?.localVideoTrack }
    var remoteVideoTrack: RTCVideoTrack? { rtc?.remoteVideoTrack }

    // MARK: - Setup WebRTC

    private func setupRTC(isVideo: Bool) {
        guard rtc == nil else { return }
        // Создаём с STUN-fallback, затем асинхронно подгружаем актуальные
        // серверы и пересоздаём peer connection если получили TURN.
        // На практике setupRTC вызывается до createOffer/answer, так что
        // успеваем подтянуть до обмена ICE кандидатами.
        let m = WebRTCManager(
            isVideo: isVideo,
            iceServers: cachedICEServers ?? Self.fallbackICE
        )

        m.onIceCandidate = { [weak self] candidate in
            guard let self, let info = self.store.state.info else { return }
            let signal = CallSignal(
                type: "candidate",
                sdp: nil,
                candidate: candidate.sdp,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: Int32(candidate.sdpMLineIndex)
            )
            SocketClient.shared.sendCallSignal(callId: info.id, signal: signal)
        }
        m.onRemoteVideoTrack = { [weak self] _ in
            // SwiftUI прочитает rtc?.remoteVideoTrack через CallManager в ActiveCallView
            Task { @MainActor in self?.objectWillChange.send() }
        }
        m.onConnectionState = { [weak self] state in
            Task { @MainActor in
                self?.store.iceState = "\(state.rawValue)"
                // При соединении переключаем в .active (если ещё в outgoing)
                if state == .connected || state == .completed,
                   case .outgoing(let info) = self?.store.state ?? .idle {
                    self?.store.state = .active(info)
                    CallKitProvider.shared.reportConnected(callId: info.id)
                }
            }
        }
        self.rtc = m
    }

    private func sendOfferAfterPermission() {
        Task {
            let ok = await requestPermissions(video: store.state.info?.type == .video)
            guard ok, let info = store.state.info else { endCurrent(reason: "no-permission"); return }
            rtc?.createOffer { [weak self] sdp in
                guard let self, let sdp else { return }
                let signal = CallSignal(
                    type: "offer", sdp: sdp.sdp,
                    candidate: nil, sdpMid: nil, sdpMLineIndex: nil
                )
                SocketClient.shared.sendCallSignal(callId: info.id, signal: signal)
            }
        }
    }

    // MARK: - Signaling

    private func wireSocket() {
        SocketClient.shared.callIncoming
            .sink { [weak self] event in self?.handleIncoming(event) }
            .store(in: &cancellables)

        SocketClient.shared.callAccepted
            .sink { [weak self] event in self?.handleAccepted(event) }
            .store(in: &cancellables)

        SocketClient.shared.callEnded
            .sink { [weak self] event in self?.handleEnded(event) }
            .store(in: &cancellables)

        SocketClient.shared.callSignal
            .sink { [weak self] event in self?.handleSignal(event) }
            .store(in: &cancellables)
    }

    private func handleIncoming(_ event: IncomingCallEvent) {
        guard case .idle = store.state else {
            // Уже в звонке → busy
            SocketClient.shared.rejectCall(callId: event.callId)
            return
        }
        let info = CallInfo(
            id: event.callId,
            chatId: event.chatId,
            peerId: event.callerId,
            peerName: event.callerName,
            peerAvatar: event.callerAvatar,
            type: event.callType,
            isInitiator: false,
            startedAt: Date()
        )
        store.state = .incoming(info)
    }

    private func handleAccepted(_ event: CallAcceptedEvent) {
        // Каллер: другой принял, можно ждать когда ICE установится
        guard case .outgoing(let info) = store.state, info.id == event.callId else { return }
        // state переключится в .active по ICE connected (см. onConnectionState)
    }

    private func handleEnded(_ event: CallEndedEvent) {
        guard let info = store.state.info, info.id == event.callId else { return }
        CallKitProvider.shared.reportRemoteEnded(callId: info.id)
        teardown()
    }

    private func handleSignal(_ event: CallSignalEvent) {
        guard let info = store.state.info, info.id == event.callId, let rtc = self.rtc else { return }
        let signal = event.signal

        if signal.type == "offer", let sdp = signal.sdp {
            let desc = RTCSessionDescription(type: .offer, sdp: sdp)
            rtc.setRemoteDescription(desc) { [weak self] _ in
                self?.hasRemoteDescription = true
                self?.flushPendingCandidates()
                rtc.createAnswer { ans in
                    guard let ans else { return }
                    let signal = CallSignal(
                        type: "answer", sdp: ans.sdp,
                        candidate: nil, sdpMid: nil, sdpMLineIndex: nil
                    )
                    SocketClient.shared.sendCallSignal(callId: info.id, signal: signal)
                }
            }
        } else if signal.type == "answer", let sdp = signal.sdp {
            let desc = RTCSessionDescription(type: .answer, sdp: sdp)
            rtc.setRemoteDescription(desc) { [weak self] _ in
                self?.hasRemoteDescription = true
                self?.flushPendingCandidates()
            }
        } else if signal.type == "candidate", let cand = signal.candidate {
            let ice = RTCIceCandidate(
                sdp: cand,
                sdpMLineIndex: signal.sdpMLineIndex ?? 0,
                sdpMid: signal.sdpMid
            )
            if hasRemoteDescription {
                rtc.addRemoteCandidate(ice)
            } else {
                pendingRemoteCandidates.append(ice)
            }
        }
    }

    private func flushPendingCandidates() {
        guard let rtc = self.rtc else { return }
        for ice in pendingRemoteCandidates {
            rtc.addRemoteCandidate(ice)
        }
        pendingRemoteCandidates.removeAll()
    }

    // MARK: - Permissions

    private func requestPermissions(video: Bool) async -> Bool {
        let mic = await withCheckedContinuation { cont in
            if #available(iOS 17, *) {
                AVAudioApplication.requestRecordPermission { cont.resume(returning: $0) }
            } else {
                AVAudioSession.sharedInstance().requestRecordPermission { cont.resume(returning: $0) }
            }
        }
        guard mic else { return false }
        if video {
            let cam = await AVCaptureDevice.requestAccess(for: .video)
            return cam
        }
        return true
    }

    // MARK: - Teardown

    private func teardown() {
        rtc?.close()
        rtc = nil
        pendingRemoteCandidates.removeAll()
        hasRemoteDescription = false
        store.state = .idle
        store.isMuted = false
        store.isVideoOff = false
        store.isSpeakerOn = true
        store.iceState = "—"
    }
}
