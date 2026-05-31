import Foundation
import AVFoundation
import Combine

/// Запись голосового сообщения.
/// - Формат: m4a / AAC, 64 kbps mono — компактно и кросс-платформенно
/// - Параллельно семплит уровень метров для waveform
@MainActor
final class AudioRecorder: ObservableObject {

    @Published private(set) var isRecording = false
    @Published private(set) var duration: TimeInterval = 0
    @Published private(set) var levels: [CGFloat] = []   // 0..1 значения, обновляются ~30Гц
    @Published private(set) var error: String?

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var fileURL: URL?

    /// Жёсткий потолок длительности — 5 минут.
    private let maxDuration: TimeInterval = 300
    /// Сколько столбцов держать в waveform-превью во время записи.
    private let visibleBars = 40

    // MARK: - Public

    /// Запрашивает разрешение микрофона.
    func requestPermission() async -> Bool {
        await withCheckedContinuation { cont in
            if #available(iOS 17, *) {
                AVAudioApplication.requestRecordPermission { granted in
                    cont.resume(returning: granted)
                }
            } else {
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
                    cont.resume(returning: granted)
                }
            }
        }
    }

    /// Старт записи. Возвращает true если получилось.
    @discardableResult
    func start() async -> Bool {
        guard await requestPermission() else {
            error = "Доступ к микрофону запрещён"
            return false
        }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)

            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("voice-\(UUID().uuidString).m4a")

            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44100,
                AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 64_000,
                AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
            ]

            let rec = try AVAudioRecorder(url: url, settings: settings)
            rec.isMeteringEnabled = true
            guard rec.record() else {
                error = "Не удалось начать запись"
                return false
            }
            self.recorder = rec
            self.fileURL = url
            self.isRecording = true
            self.duration = 0
            self.levels = []

            startTimer()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    /// Остановить запись. Возвращает (url файла, длительность, полная waveform).
    /// Возвращает nil, если запись была отменена или пуста.
    func stop() -> (url: URL, duration: TimeInterval, waveform: [CGFloat])? {
        defer { teardown() }
        guard let rec = recorder, isRecording else { return nil }
        let captured = (rec.url, rec.currentTime, levels)
        rec.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        return (captured.0, captured.1, captured.2)
    }

    /// Отменить и удалить файл.
    func cancel() {
        recorder?.stop()
        if let url = recorder?.url {
            try? FileManager.default.removeItem(at: url)
        }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        teardown()
    }

    // MARK: - Internals

    private func startTimer() {
        timer?.invalidate()
        // ~33Гц обновлений — достаточно для плавного движения столбцов
        timer = Timer.scheduledTimer(withTimeInterval: 0.03, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tick()
            }
        }
    }

    private func tick() {
        guard let rec = recorder, isRecording else { return }
        rec.updateMeters()
        let db = rec.averagePower(forChannel: 0)
        // dB → 0..1 (логарифмическая шкала)
        let normalized = max(0, min(1, (db + 50) / 50))
        levels.append(CGFloat(normalized))
        if levels.count > visibleBars { levels.removeFirst(levels.count - visibleBars) }
        duration = rec.currentTime
        if duration >= maxDuration { _ = stop() }
    }

    private func teardown() {
        timer?.invalidate()
        timer = nil
        recorder = nil
        isRecording = false
    }
}
