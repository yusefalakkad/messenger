import SwiftUI

/// Полноэкранный экран активного / исходящего звонка.
struct ActiveCallView: View {
    let info: CallInfo
    let isOutgoing: Bool          // ждём accept (false когда уже active)

    @ObservedObject private var store = CallStore.shared
    private let mgr = CallManager.shared

    @State private var elapsed: TimeInterval = 0
    @State private var ticker: Timer?

    var body: some View {
        ZStack {
            backgroundLayer

            VStack(spacing: 20) {
                Spacer()

                if info.type == .audio || mgr.remoteVideoTrack == nil {
                    audioBigAvatar
                } else {
                    Color.clear // remote video занимает весь фон
                }

                VStack(spacing: 6) {
                    Text(info.peerName)
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(.white)
                    Text(statusLine)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .shadow(color: .black.opacity(0.4), radius: 8)

                Spacer()

                if info.type == .video, let local = mgr.localVideoTrack {
                    RTCVideoView(track: local, contentMode: .scaleAspectFill, mirror: true)
                        .frame(width: 110, height: 150)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.15), lineWidth: 1))
                        .shadow(color: .black.opacity(0.45), radius: 16, x: 0, y: 6)
                        .padding(.bottom, 12)
                }

                controls
                    .padding(.bottom, 30)
            }
            .padding(.top, 60)
            .padding(.horizontal, 24)
        }
        .ignoresSafeArea()
        .preferredColorScheme(.dark)
        .onAppear {
            ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
                elapsed = Date().timeIntervalSince(info.startedAt)
            }
        }
        .onDisappear { ticker?.invalidate() }
    }

    // MARK: - Background

    @ViewBuilder
    private var backgroundLayer: some View {
        if info.type == .video, let remote = mgr.remoteVideoTrack {
            RTCVideoView(track: remote, contentMode: .scaleAspectFill, mirror: false)
                .ignoresSafeArea()
                .overlay(LinearGradient(
                    colors: [.black.opacity(0.5), .clear, .black.opacity(0.5)],
                    startPoint: .top, endPoint: .bottom))
        } else {
            ZStack {
                AmbientBackground()
                LinearGradient(
                    colors: [.black.opacity(0.6), .clear],
                    startPoint: .top, endPoint: .bottom
                )
            }
        }
    }

    // MARK: - Avatar for audio

    private var audioBigAvatar: some View {
        ZStack {
            Circle().fill(LinearGradient.brand).frame(width: 160, height: 160)
                .blur(radius: 30).opacity(0.5)
            Avatar(url: info.peerAvatar, name: info.peerName, size: 132, withGradientRing: true)
                .frame(width: 140, height: 140)
        }
    }

    // MARK: - Status line

    private var statusLine: String {
        if isOutgoing { return "Вызов…" }
        if case .outgoing = store.state { return "Вызов…" }
        return formatTime(elapsed)
    }

    // MARK: - Controls

    private var controls: some View {
        HStack(spacing: 18) {
            controlButton(
                system: store.isMuted ? "mic.slash.fill" : "mic.fill",
                background: store.isMuted ? Color.white : Color.white.opacity(0.15),
                fg: store.isMuted ? .black : .white,
                action: mgr.toggleMute
            )

            if info.type == .video {
                controlButton(
                    system: store.isVideoOff ? "video.slash.fill" : "video.fill",
                    background: store.isVideoOff ? Color.white : Color.white.opacity(0.15),
                    fg: store.isVideoOff ? .black : .white,
                    action: mgr.toggleVideo
                )
                controlButton(
                    system: "arrow.triangle.2.circlepath.camera",
                    background: Color.white.opacity(0.15),
                    fg: .white,
                    action: mgr.switchCamera
                )
            } else {
                controlButton(
                    system: store.isSpeakerOn ? "speaker.wave.2.fill" : "speaker.fill",
                    background: store.isSpeakerOn ? Color.white : Color.white.opacity(0.15),
                    fg: store.isSpeakerOn ? .black : .white,
                    action: mgr.toggleSpeaker
                )
            }

            // End-call button
            Button {
                mgr.endCurrent()
            } label: {
                Image(systemName: "phone.down.fill")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 68, height: 68)
                    .background(Color(hex: 0xF43F5E))
                    .clipShape(Circle())
                    .shadow(color: Color(hex: 0xF43F5E).opacity(0.6), radius: 18, x: 0, y: 8)
            }
            .buttonStyle(PressDownStyle())
        }
    }

    private func controlButton(system: String, background: Color, fg: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(fg)
                .frame(width: 56, height: 56)
                .background(background)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 1))
        }
        .buttonStyle(PressDownStyle())
    }

    private func formatTime(_ t: TimeInterval) -> String {
        let s = Int(t)
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}
