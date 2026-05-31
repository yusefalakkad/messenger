import SwiftUI
import AVFoundation

/// Полноэкранный экран записи видео-кружка.
struct CircleRecorderView: View {
    let onRecorded: (URL, TimeInterval) -> Void
    let onCancel: () -> Void

    @StateObject private var rec = CircleRecorder()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Круглое превью камеры
            ZStack {
                if rec.isReady {
                    CameraPreview(session: rec.session)
                        .aspectRatio(1, contentMode: .fill)
                } else {
                    ProgressView().tint(.white)
                }
            }
            .frame(width: 300, height: 300)
            .clipShape(Circle())
            .overlay(
                Circle().stroke(LinearGradient.brand, lineWidth: rec.isRecording ? 6 : 3)
            )
            .shadow(color: Color.brandViolet.opacity(0.5), radius: 30)

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
                    .background(Color(hex: 0xF43F5E).opacity(0.8))
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
                    .background(Color.white.opacity(0.12))
                    .clipShape(Circle())
            }

            Spacer()

            Button {
                Task { await rec.switchCamera() }
            } label: {
                Image(systemName: "arrow.triangle.2.circlepath.camera")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Color.white.opacity(0.12))
                    .clipShape(Circle())
            }
        }
    }

    private var timerLabel: some View {
        Text(String(format: "%d:%02d / 1:00",
                    Int(rec.duration) / 60,
                    Int(rec.duration) % 60))
            .font(.system(size: 14, weight: .semibold).monospacedDigit())
            .foregroundStyle(.white.opacity(0.85))
            .padding(.horizontal, 14).padding(.vertical, 6)
            .background(Color.white.opacity(0.12))
            .clipShape(Capsule())
    }

    private var recordButton: some View {
        ZStack {
            // Прогресс-кольцо вокруг кнопки
            Circle()
                .stroke(Color.white.opacity(0.15), lineWidth: 4)
                .frame(width: 84, height: 84)
            Circle()
                .trim(from: 0, to: rec.duration / rec.maxDuration)
                .stroke(LinearGradient.brand, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: 84, height: 84)
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 0.05), value: rec.duration)

            // Сам кружок
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
                Circle()
                    .fill(rec.isRecording ? Color(hex: 0xF43F5E) : Color.white)
                    .frame(width: rec.isRecording ? 44 : 68, height: rec.isRecording ? 44 : 68)
                    .overlay(
                        Group {
                            if rec.isRecording {
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(Color.white)
                                    .frame(width: 22, height: 22)
                            }
                        }
                    )
            }
            .buttonStyle(PressDownStyle())
            .disabled(!rec.isReady)
        }
    }
}

// MARK: - UIView bridge for preview

struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> CircleCameraPreviewView {
        let v = CircleCameraPreviewView()
        v.previewLayer.session = session
        v.previewLayer.videoGravity = .resizeAspectFill
        return v
    }

    func updateUIView(_ uiView: CircleCameraPreviewView, context: Context) {
        if uiView.previewLayer.session !== session {
            uiView.previewLayer.session = session
        }
    }
}
