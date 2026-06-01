import SwiftUI
import AVKit

/// Полноразмерное видео-сообщение в чате (прямоугольное, с системными контролами).
/// В отличие от CirclePlayerView — НЕ зацикливается, mute по умолчанию,
/// при тапе на превью раскрывается полноразмерный плеер.
struct VideoMessage: View {
    let media: MediaInfo
    let isOwn: Bool

    @State private var showPlayer = false

    private static let timeFmt: DateComponentsFormatter = {
        let f = DateComponentsFormatter()
        f.allowedUnits = [.minute, .second]
        f.zeroFormattingBehavior = .pad
        return f
    }()

    var body: some View {
        Button {
            showPlayer = true
        } label: {
            ZStack(alignment: .bottomTrailing) {
                // Постер (превью) или серая заглушка
                if let thumb = media.thumbnailUrl, let url = URL(string: thumb) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().scaledToFill()
                        default:
                            Rectangle().fill(Color.white.opacity(0.06))
                        }
                    }
                    .frame(maxWidth: 260, maxHeight: 320)
                } else {
                    Rectangle()
                        .fill(LinearGradient.glassCard)
                        .frame(width: 240, height: 180)
                }

                // Затемнение + play
                ZStack {
                    Rectangle().fill(Color.black.opacity(0.25))
                    Circle()
                        .fill(Color.black.opacity(0.5))
                        .frame(width: 56, height: 56)
                    Image(systemName: "play.fill")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(.white)
                        .offset(x: 2)
                }

                // Длительность снизу-справа
                if let d = media.duration, d > 0 {
                    Text(formatDuration(d))
                        .font(.system(size: 11, weight: .semibold).monospacedDigit())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background(Color.black.opacity(0.65))
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        .padding(8)
                }
            }
            .frame(maxWidth: 260, maxHeight: 320)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(LinearGradient.brand, lineWidth: 1.5)
                    .opacity(0.4)
            )
        }
        .buttonStyle(PressDownStyle())
        .fullScreenCover(isPresented: $showPlayer) {
            VideoPlayerSheet(url: media.url) { showPlayer = false }
        }
    }

    private func formatDuration(_ d: Double) -> String {
        Self.timeFmt.string(from: d) ?? "0:00"
    }
}

/// Полноэкранный плеер с системными контролами (AVPlayerViewController).
private struct VideoPlayerSheet: View {
    let url: String
    let onClose: () -> Void

    @State private var player: AVPlayer?

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()

            if let player {
                VideoPlayerWrapper(player: player)
                    .ignoresSafeArea()
            }

            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Color.white.opacity(0.18))
                    .clipShape(Circle())
            }
            .padding(.top, 60)
            .padding(.trailing, 16)
        }
        .onAppear {
            if let url = URL(string: url) {
                let p = AVPlayer(url: url)
                p.isMuted = false
                player = p
                p.play()
            }
        }
        .onDisappear {
            player?.pause()
            player = nil
        }
    }
}

private struct VideoPlayerWrapper: UIViewControllerRepresentable {
    let player: AVPlayer

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let vc = AVPlayerViewController()
        vc.player = player
        vc.showsPlaybackControls = true
        vc.videoGravity = .resizeAspect
        vc.allowsPictureInPicturePlayback = false
        return vc
    }

    func updateUIViewController(_ vc: AVPlayerViewController, context: Context) {
        vc.player = player
    }
}
