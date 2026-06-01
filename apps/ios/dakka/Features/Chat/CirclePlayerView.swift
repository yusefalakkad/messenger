import SwiftUI
import AVKit

/// Видео-кружок в чате: круглый, лупится автоматически, тап = play/pause.
struct CirclePlayerView: View {
    let media: MediaInfo
    let isOwn: Bool

    @State private var player: AVPlayer?
    @State private var isPlaying = false

    var body: some View {
        ZStack {
            if let player {
                AVPlayerControllerRepresented(player: player)
                    .disabled(true)  // отключаем системные controls
            } else if let thumb = media.thumbnailUrl, let url = URL(string: thumb) {
                AsyncImage(url: url) { img in
                    img.resizable().scaledToFill()
                } placeholder: {
                    Color.darkCard
                }
            } else {
                Color.darkCard
            }

            if !isPlaying {
                Circle().fill(Color.black.opacity(0.35)).frame(width: 56, height: 56)
                Image(systemName: "play.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(.white)
                    .offset(x: 2)
            }
        }
        .frame(width: 200, height: 200)
        .clipShape(Circle())
        .overlay(
            Circle().stroke(LinearGradient.brand, lineWidth: 2)
        )
        .shadow(color: .black.opacity(0.5), radius: 14, x: 0, y: 6)
        .onTapGesture { toggle() }
        .onAppear {
            if let url = URL(string: media.url) {
                player = AVPlayer(url: url)
                NotificationCenter.default.addObserver(
                    forName: .AVPlayerItemDidPlayToEndTime,
                    object: player?.currentItem,
                    queue: .main
                ) { _ in
                    player?.seek(to: .zero)
                    player?.play()
                }
            }
        }
        .onDisappear {
            player?.pause()
            player = nil
        }
    }

    private func toggle() {
        guard let player else { return }
        if isPlaying {
            player.pause()
            isPlaying = false
        } else {
            player.seek(to: .zero)
            player.play()
            isPlaying = true
        }
    }
}

/// Тонкая обёртка над AVPlayerViewController без системных контролов.
struct AVPlayerControllerRepresented: UIViewControllerRepresentable {
    let player: AVPlayer

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let vc = AVPlayerViewController()
        vc.player = player
        vc.showsPlaybackControls = false
        vc.videoGravity = .resizeAspectFill
        vc.allowsPictureInPicturePlayback = false
        return vc
    }

    func updateUIViewController(_ vc: AVPlayerViewController, context: Context) {
        vc.player = player
    }
}
