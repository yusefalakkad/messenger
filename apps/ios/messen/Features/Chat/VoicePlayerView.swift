import SwiftUI

/// Inline-плеер для голосового сообщения внутри пузырька.
struct VoicePlayerView: View {
    let media: MediaInfo
    let isOwn: Bool

    @StateObject private var player = AudioPlayer.shared

    private var url: URL? { URL(string: media.url) }
    private var isThisPlaying: Bool {
        guard let url else { return false }
        return player.currentURL == url && player.isPlaying
    }
    private var progressForThis: Double {
        guard let url, player.currentURL == url else { return 0 }
        return player.progress
    }

    /// Сэмплированный waveform от бэка либо синтетический.
    private var bars: [CGFloat] {
        if let w = media.waveform, !w.isEmpty {
            return w.map { CGFloat($0) }
        }
        // Если waveform не пришёл — рисуем мягкую "волну" по синусу
        return (0..<32).map { i in 0.3 + 0.5 * sin(Double(i) * 0.4) }
    }

    private var totalSec: Double {
        media.duration ?? player.totalDuration
    }

    private var timeLabel: String {
        let t: Double = isThisPlaying ? totalSec * progressForThis : totalSec
        let secs = Int(t.rounded())
        return String(format: "%d:%02d", secs / 60, secs % 60)
    }

    var body: some View {
        HStack(spacing: 10) {
            playButton

            // Waveform
            GeometryReader { geo in
                let count = bars.count
                let filled = Int(progressForThis * Double(count))
                HStack(spacing: 2) {
                    ForEach(0..<count, id: \.self) { i in
                        Capsule()
                            .fill(barColor(playedUpTo: i < filled))
                            .frame(width: max(1, (geo.size.width - CGFloat(count - 1) * 2) / CGFloat(count)),
                                   height: max(3, bars[i] * 26))
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height, alignment: .center)
            }
            .frame(height: 28)
            .frame(minWidth: 110)

            Text(timeLabel)
                .font(.system(size: 11, weight: .medium).monospacedDigit())
                .foregroundStyle(.white.opacity(isOwn ? 0.85 : 0.55))
        }
    }

    private var playButton: some View {
        Button {
            guard let url else { return }
            player.toggle(url: url)
        } label: {
            Image(systemName: isThisPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .background(
                    Group {
                        if isOwn { Color.white.opacity(0.22) }
                        else     { LinearGradient.brand }
                    }
                )
                .clipShape(Circle())
        }
        .buttonStyle(PressDownStyle())
    }

    private func barColor(playedUpTo: Bool) -> Color {
        if playedUpTo {
            return isOwn ? .white : Color.brandViolet
        }
        return Color.white.opacity(isOwn ? 0.35 : 0.25)
    }
}
