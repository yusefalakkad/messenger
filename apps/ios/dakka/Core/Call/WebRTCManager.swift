import Foundation
import WebRTC
import AVFoundation

/// Низкоуровневая обёртка над RTCPeerConnection.
/// • Создаёт фабрику, peer connection, локальные треки (mic + camera)
/// • Прокидывает события (ICE candidate, remote track) наверх через callbacks
/// • Не знает про socket — это работа CallManager
final class WebRTCManager: NSObject {

    // MARK: - Static factory (singleton — иначе крашит)

    private static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        let encoderFactory = RTCDefaultVideoEncoderFactory()
        let decoderFactory = RTCDefaultVideoDecoderFactory()
        return RTCPeerConnectionFactory(encoderFactory: encoderFactory, decoderFactory: decoderFactory)
    }()

    // MARK: - Public callbacks

    var onIceCandidate:    ((RTCIceCandidate) -> Void)?
    var onRemoteVideoTrack: ((RTCVideoTrack) -> Void)?
    var onConnectionState: ((RTCIceConnectionState) -> Void)?

    // MARK: - Audio session (для WebRTC голос-режим)

    let rtcAudioSession = RTCAudioSession.sharedInstance()

    // MARK: - State

    private var peerConnection: RTCPeerConnection?
    private(set) var localVideoTrack: RTCVideoTrack?
    private(set) var localAudioTrack: RTCAudioTrack?
    private(set) var remoteVideoTrack: RTCVideoTrack?
    private var videoCapturer: RTCCameraVideoCapturer?

    private let isVideo: Bool

    // MARK: - Init

    init(isVideo: Bool) {
        self.isVideo = isVideo
        super.init()
        setupPeerConnection()
        setupAudioSession()
        addLocalTracks()
    }

    deinit {
        close()
    }

    private func setupPeerConnection() {
        let cfg = RTCConfiguration()
        cfg.iceServers = [
            RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"]),
        ]
        cfg.sdpSemantics = .unifiedPlan
        cfg.continualGatheringPolicy = .gatherContinually

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
        )
        peerConnection = Self.factory.peerConnection(with: cfg, constraints: constraints, delegate: self)
    }

    private func setupAudioSession() {
        rtcAudioSession.lockForConfiguration()
        do {
            try rtcAudioSession.setCategory(AVAudioSession.Category.playAndRecord.rawValue,
                                            with: [.allowBluetooth, .defaultToSpeaker])
            try rtcAudioSession.setMode(AVAudioSession.Mode.voiceChat.rawValue)
        } catch {
            print("[WebRTC] audio session error:", error)
        }
        rtcAudioSession.unlockForConfiguration()
    }

    private func addLocalTracks() {
        guard let pc = peerConnection else { return }
        let streamId = "messen-stream"

        // Audio track
        let audioConstraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let audioSource = Self.factory.audioSource(with: audioConstraints)
        let audioTrack = Self.factory.audioTrack(with: audioSource, trackId: "audio0")
        pc.add(audioTrack, streamIds: [streamId])
        self.localAudioTrack = audioTrack

        // Video track (только если video-звонок)
        if isVideo {
            let videoSource = Self.factory.videoSource()
            let videoTrack = Self.factory.videoTrack(with: videoSource, trackId: "video0")
            pc.add(videoTrack, streamIds: [streamId])
            self.localVideoTrack = videoTrack
            self.videoCapturer = RTCCameraVideoCapturer(delegate: videoSource)
            startCapturingVideo()
        }
    }

    private func startCapturingVideo() {
        guard let capturer = videoCapturer else { return }
        guard let frontCam = RTCCameraVideoCapturer.captureDevices().first(where: { $0.position == .front }) else {
            return
        }
        let format = RTCCameraVideoCapturer.supportedFormats(for: frontCam)
            .sorted { f1, f2 in
                let d1 = CMVideoFormatDescriptionGetDimensions(f1.formatDescription)
                let d2 = CMVideoFormatDescriptionGetDimensions(f2.formatDescription)
                return Int(d1.width) * Int(d1.height) < Int(d2.width) * Int(d2.height)
            }
            .first { fmt in
                let d = CMVideoFormatDescriptionGetDimensions(fmt.formatDescription)
                return d.width >= 640 && d.width <= 1280
            } ?? RTCCameraVideoCapturer.supportedFormats(for: frontCam).first!
        let fps = format.videoSupportedFrameRateRanges.map { $0.maxFrameRate }.max() ?? 30
        capturer.startCapture(with: frontCam, format: format, fps: Int(min(30, fps))) { err in
            if let err { print("[WebRTC] capture error:", err) }
        }
    }

    // MARK: - SDP offer/answer

    func createOffer(completion: @escaping (RTCSessionDescription?) -> Void) {
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveAudio": "true",
                "OfferToReceiveVideo": isVideo ? "true" : "false",
            ],
            optionalConstraints: nil
        )
        peerConnection?.offer(for: constraints) { [weak self] sdp, _ in
            guard let self, let sdp else { completion(nil); return }
            self.peerConnection?.setLocalDescription(sdp) { _ in
                completion(sdp)
            }
        }
    }

    func createAnswer(completion: @escaping (RTCSessionDescription?) -> Void) {
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveAudio": "true",
                "OfferToReceiveVideo": isVideo ? "true" : "false",
            ],
            optionalConstraints: nil
        )
        peerConnection?.answer(for: constraints) { [weak self] sdp, _ in
            guard let self, let sdp else { completion(nil); return }
            self.peerConnection?.setLocalDescription(sdp) { _ in
                completion(sdp)
            }
        }
    }

    func setRemoteDescription(_ sdp: RTCSessionDescription, completion: @escaping (Error?) -> Void) {
        peerConnection?.setRemoteDescription(sdp, completionHandler: completion)
    }

    func addRemoteCandidate(_ candidate: RTCIceCandidate, completion: @escaping (Error?) -> Void = { _ in }) {
        peerConnection?.add(candidate, completionHandler: completion)
    }

    // MARK: - Mute / camera switch / speaker

    var isMuted: Bool {
        get { localAudioTrack?.isEnabled == false }
        set { localAudioTrack?.isEnabled = !newValue }
    }

    var isVideoOff: Bool {
        get { localVideoTrack?.isEnabled == false }
        set { localVideoTrack?.isEnabled = !newValue }
    }

    func switchCamera(completion: ((Bool) -> Void)? = nil) {
        guard let capturer = videoCapturer else { completion?(false); return }
        let current = (capturer.captureSession.inputs.first as? AVCaptureDeviceInput)?.device
        let nextPos: AVCaptureDevice.Position = current?.position == .front ? .back : .front
        guard let next = RTCCameraVideoCapturer.captureDevices().first(where: { $0.position == nextPos }) else {
            completion?(false); return
        }
        let formats = RTCCameraVideoCapturer.supportedFormats(for: next)
        let format = formats.first { fmt in
            let d = CMVideoFormatDescriptionGetDimensions(fmt.formatDescription)
            return d.width >= 640 && d.width <= 1280
        } ?? formats.first!
        capturer.stopCapture { [weak capturer] in
            capturer?.startCapture(with: next, format: format, fps: 30) { err in
                completion?(err == nil)
            }
        }
    }

    func setSpeakerOn(_ on: Bool) {
        rtcAudioSession.lockForConfiguration()
        do {
            try rtcAudioSession.overrideOutputAudioPort(on ? .speaker : .none)
        } catch {
            print("[WebRTC] speaker switch error:", error)
        }
        rtcAudioSession.unlockForConfiguration()
    }

    // MARK: - Teardown

    func close() {
        videoCapturer?.stopCapture()
        videoCapturer = nil
        peerConnection?.close()
        peerConnection = nil
        localAudioTrack = nil
        localVideoTrack = nil
        remoteVideoTrack = nil
    }
}

// MARK: - RTCPeerConnectionDelegate

extension WebRTCManager: RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        onConnectionState?(newState)
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        onIceCandidate?(candidate)
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        if let videoTrack = stream.videoTracks.first {
            self.remoteVideoTrack = videoTrack
            onRemoteVideoTrack?(videoTrack)
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
}
