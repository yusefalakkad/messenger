import Foundation
import AVFoundation
import UIKit
import Combine

/// Запись видео-кружка (короткое видео в круглом превью).
/// Использует AVCaptureSession + AVCaptureMovieFileOutput.
@MainActor
final class CircleRecorder: NSObject, ObservableObject {

    // MARK: - State

    @Published private(set) var isReady = false
    @Published private(set) var isRecording = false
    @Published private(set) var duration: TimeInterval = 0
    @Published private(set) var error: String?

    /// Жёсткий потолок длительности.
    let maxDuration: TimeInterval = 60

    // MARK: - Capture

    let session = AVCaptureSession()
    private let movieOutput = AVCaptureMovieFileOutput()
    private var currentURL: URL?
    private var timer: Timer?

    private var continuation: CheckedContinuation<(URL, TimeInterval)?, Never>?

    // MARK: - Configure

    /// Запрашивает разрешения и поднимает session.
    func prepare(useFrontCamera: Bool = true) async {
        let mic = await requestMicPermission()
        let cam = await AVCaptureDevice.requestAccess(for: .video)
        guard mic, cam else {
            error = "Нет доступа к камере или микрофону"
            return
        }

        await Task.detached(priority: .userInitiated) { [weak self] in
            guard let self else { return }
            await self.configureSession(useFrontCamera: useFrontCamera)
        }.value
    }

    nonisolated private func configureSession(useFrontCamera: Bool) async {
        let session = await self.session
        session.beginConfiguration()
        session.sessionPreset = .high

        // Очищаем предыдущие inputs
        for input in session.inputs { session.removeInput(input) }
        for output in session.outputs { session.removeOutput(output) }

        // Video input
        let pos: AVCaptureDevice.Position = useFrontCamera ? .front : .back
        guard let cam = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: pos),
              let videoIn = try? AVCaptureDeviceInput(device: cam)
        else {
            await MainActor.run { self.error = "Не удалось открыть камеру" }
            session.commitConfiguration()
            return
        }
        if session.canAddInput(videoIn) { session.addInput(videoIn) }

        // Audio input
        if let mic = AVCaptureDevice.default(for: .audio),
           let audioIn = try? AVCaptureDeviceInput(device: mic),
           session.canAddInput(audioIn) {
            session.addInput(audioIn)
        }

        // Output
        let output = await self.movieOutput
        if session.canAddOutput(output) {
            session.addOutput(output)
            if let conn = output.connection(with: .video) {
                conn.videoOrientation = .portrait
                if pos == .front { conn.isVideoMirrored = true }
            }
        }

        session.commitConfiguration()
        session.startRunning()

        await MainActor.run { self.isReady = true }
    }

    func stopSession() {
        if session.isRunning { session.stopRunning() }
        isReady = false
    }

    func switchCamera() async {
        guard let currentInput = session.inputs.compactMap({ $0 as? AVCaptureDeviceInput }).first(where: { $0.device.hasMediaType(.video) }) else { return }
        let isFront = currentInput.device.position == .front
        await prepare(useFrontCamera: !isFront)
    }

    // MARK: - Record

    /// Запускает запись, возвращает (url, duration) когда остановится.
    /// Если отмена/ошибка — nil.
    func record() async -> (URL, TimeInterval)? {
        guard !isRecording else { return nil }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("circle-\(UUID().uuidString).mov")
        currentURL = url
        duration = 0

        return await withCheckedContinuation { (cont: CheckedContinuation<(URL, TimeInterval)?, Never>) in
            self.continuation = cont
            self.movieOutput.startRecording(to: url, recordingDelegate: self)
            // Дальше — delegate-callback в файле ниже выставит isRecording + запустит timer
        }
    }

    func stopRecording() {
        guard isRecording else { return }
        movieOutput.stopRecording()
    }

    func cancel() {
        if movieOutput.isRecording { movieOutput.stopRecording() }
        // Continuation вернёт nil через delegate при cancel
    }

    private func requestMicPermission() async -> Bool {
        await withCheckedContinuation { cont in
            if #available(iOS 17, *) {
                AVAudioApplication.requestRecordPermission { cont.resume(returning: $0) }
            } else {
                AVAudioSession.sharedInstance().requestRecordPermission { cont.resume(returning: $0) }
            }
        }
    }
}

// MARK: - AVCaptureFileOutputRecordingDelegate

extension CircleRecorder: AVCaptureFileOutputRecordingDelegate {

    nonisolated func fileOutput(
        _ output: AVCaptureFileOutput,
        didStartRecordingTo fileURL: URL,
        from connections: [AVCaptureConnection]
    ) {
        Task { @MainActor in
            self.isRecording = true
            self.duration = 0
            self.timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    guard let self else { return }
                    self.duration += 0.05
                    if self.duration >= self.maxDuration {
                        self.stopRecording()
                    }
                }
            }
        }
    }

    nonisolated func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        Task { @MainActor in
            self.timer?.invalidate()
            self.timer = nil
            let dur = self.duration
            self.isRecording = false
            let result: (URL, TimeInterval)?
            if let error {
                self.error = error.localizedDescription
                result = nil
            } else if dur < 0.4 {
                // Слишком короткое — удаляем
                try? FileManager.default.removeItem(at: outputFileURL)
                result = nil
            } else {
                result = (outputFileURL, dur)
            }
            self.continuation?.resume(returning: result)
            self.continuation = nil
        }
    }
}

// MARK: - Preview layer host

/// UIView, в который встраивается AVCaptureVideoPreviewLayer.
final class CircleCameraPreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}
