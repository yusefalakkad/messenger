import SwiftUI
import AVFoundation

/// Полноэкранный экран записи видео-сообщения (прямоугольное полное видео).
/// Отличается от CircleRecorderView тем, что превью на весь экран и итог — обычное видео.
struct VideoRecorderView: View {
    let onRecorded: (URL, TimeInterval) -> Void
    let onCancel: () -> Void

    @StateObject private var rec = VideoRecorder()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Превью камеры — на весь экран
            if rec.isReady {
                VideoCameraPreview(session: rec.session)
                    .ignoresSafeArea()
            } else {
                ProgressView().tint(.white)
            }

            VStack {
                topBar
                Spacer()
                if rec.isRecording {
                    timerLabel
                        .padding(.bottom, 6)
                }
                recordButton
                    .padding(.bottom, 50)
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)

            if let err = rec.error {
                Text(err)
                    .font(Typo.small)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Color(hex: 0xF43F5E).opacity(0.85))
                    .clipShape(Capsule())
                    .padding(.bottom, 200)
            }
        }
        .preferredColorScheme(.dark)
        .task { await rec.prepare() }
        .onDisappear { rec.stopSession() }
    }

    // MARK: - Pieces

    private var topBar: some View {
        HStack {
            Button {
                rec.cancel()
                onCancel()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Color.white.opacity(0.18))
                    .clipShape(Circle())
            }

            Spacer()

            if rec.isRecording {
                HStack(spacing: 6) {
                    Circle().fill(Color(hex: 0xF43F5E)).frame(width: 8, height: 8)
                    Text("Запись")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Color.black.opacity(0.35))
                .clipShape(Capsule())
            }

            Spacer()

            Button {
                Task { await rec.switchCamera() }
            } label: {
                Image(systemName: "arrow.triangle.2.circlepath.camera")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Color.white.opacity(0.18))
                    .clipShape(Circle())
            }
            .disabled(rec.isRecording)
            .opacity(rec.isRecording ? 0.4 : 1)
        }
    }

    private var timerLabel: some View {
        Text(String(format: "%d:%02d / 1:00",
                    Int(rec.duration) / 60,
                    Int(rec.duration) % 60))
            .font(.system(size: 14, weight: .semibold).monospacedDigit())
            .foregroundStyle(.white)
            .padding(.horizontal, 14).padding(.vertical, 6)
            .background(Color.black.opacity(0.45))
            .clipShape(Capsule())
    }

    private var recordButton: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.2), lineWidth: 4)
                .frame(width: 90, height: 90)
            Circle()
                .trim(from: 0, to: rec.duration / rec.maxDuration)
                .stroke(LinearGradient.brand, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: 90, height: 90)
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 0.05), value: rec.duration)

            Button {
                if rec.isRecording {
                    rec.stopRecording()
                } else {
                    Task {
                        if let (url, duration) = await rec.record() {
                            onRecorded(url, duration)
                        }
                    }
                }
            } label: {
                if rec.isRecording {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color(hex: 0xF43F5E))
                        .frame(width: 38, height: 38)
                } else {
                    Circle()
                        .fill(Color.white)
                        .frame(width: 70, height: 70)
                        .overlay(
                            Circle()
                                .fill(Color(hex: 0xF43F5E))
                                .frame(width: 56, height: 56)
                        )
                }
            }
            .buttonStyle(PressDownStyle())
            .disabled(!rec.isReady)
        }
    }
}

// MARK: - UIView bridge for preview

struct VideoCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> VideoCameraPreviewView {
        let v = VideoCameraPreviewView()
        v.previewLayer.session = session
        v.previewLayer.videoGravity = .resizeAspectFill
        return v
    }

    func updateUIView(_ uiView: VideoCameraPreviewView, context: Context) {
        if uiView.previewLayer.session !== session {
            uiView.previewLayer.session = session
        }
    }
}

/// UIView, в который встраивается AVCaptureVideoPreviewLayer.
final class VideoCameraPreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}
