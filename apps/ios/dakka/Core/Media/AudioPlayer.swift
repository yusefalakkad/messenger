import Foundation
import AVFoundation
import Combine

/// Воспроизведение голосового сообщения.
/// Один общий синглтон, чтобы при тапе на новое сообщение
/// старое автоматически останавливалось.
@MainActor
final class AudioPlayer: NSObject, ObservableObject {
    static let shared = AudioPlayer()

    @Published private(set) var currentURL: URL?
    @Published private(set) var isPlaying = false
    @Published private(set) var progress: Double = 0
    @Published private(set) var totalDuration: TimeInterval = 0

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?

    private override init() { super.init() }

    /// Старт/пауза. Если играет другой URL — переключается.
    func toggle(url: URL) {
        if currentURL == url, let p = player {
            if isPlaying { p.pause(); isPlaying = false }
            else         { p.play();  isPlaying = true }
            return
        }
        loadAndPlay(url: url)
    }

    func stop() {
        player?.pause()
        player = nil
        currentURL = nil
        isPlaying = false
        progress = 0
        totalDuration = 0
        removeObservers()
    }

    // MARK: - Internals

    private func loadAndPlay(url: URL) {
        stop()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
        } catch {
            print("[AudioPlayer] session error:", error)
        }

        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        self.player = p
        self.currentURL = url

        // Observers
        let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
        timeObserver = p.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            // Closure типа @Sendable, но runs на main queue — безопасно
            // мутировать @MainActor свойства через assumeIsolated.
            MainActor.assumeIsolated {
                guard let self else { return }
                let dur = item.duration.seconds
                if dur.isFinite, dur > 0 {
                    self.totalDuration = dur
                    self.progress = max(0, min(1, time.seconds / dur))
                }
            }
        }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.isPlaying = false
                self?.progress = 0
                self?.player?.seek(to: .zero)
            }
        }

        p.play()
        isPlaying = true
    }

    private func removeObservers() {
        if let tok = timeObserver { player?.removeTimeObserver(tok); timeObserver = nil }
        if let obs = endObserver  { NotificationCenter.default.removeObserver(obs); endObserver = nil }
    }
}
