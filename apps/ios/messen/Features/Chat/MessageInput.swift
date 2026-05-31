import SwiftUI
import PhotosUI

struct MessageInput: View {
    @Binding var text: String
    let onSend: () -> Void
    let onTextChanged: () -> Void
    let onVoiceRecorded: (URL, TimeInterval, [CGFloat]) -> Void
    let onImageSelected: (ImagePreparer.Prepared) -> Void

    @FocusState private var focused: Bool
    @StateObject private var recorder = AudioRecorder()
    @State private var photoItem: PhotosPickerItem?

    private var hasText: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if recorder.isRecording {
                cancelRecordButton
                waveformPreview
                Text(timeString(recorder.duration))
                    .font(.system(size: 12, weight: .semibold).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.7))
                sendRecordedButton
            } else {
                attachButton
                inputField
                rightActionButton
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(
            Rectangle()
                .fill(Color.darkSurface.opacity(0.7))
                .background(.ultraThinMaterial)
                .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.05)), alignment: .top)
        )
        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: recorder.isRecording)
    }

    // MARK: - Static input pieces

    private var attachButton: some View {
        PhotosPicker(
            selection: $photoItem,
            matching: .images,
            photoLibrary: .shared()
        ) {
            Image(systemName: "paperclip")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(.white.opacity(0.55))
                .padding(8)
        }
        .onChange(of: photoItem) { _, newValue in
            guard let newValue else { return }
            Task {
                do {
                    if let prepared = try await ImagePreparer.prepare(newValue) {
                        onImageSelected(prepared)
                    }
                    photoItem = nil
                } catch {
                    photoItem = nil
                }
            }
        }
    }

    private var inputField: some View {
        HStack(alignment: .bottom, spacing: 6) {
            TextField("Сообщение…", text: $text, axis: .vertical)
                .font(Typo.body)
                .foregroundStyle(.white)
                .tint(.brandViolet)
                .focused($focused)
                .lineLimit(1...6)
                .onChange(of: text) { _, _ in onTextChanged() }
                .onSubmit { if hasText { onSend() } }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(focused ? Color.brandViolet.opacity(0.5) : Color.white.opacity(0.07), lineWidth: 1)
        )
        .animation(.easeOut(duration: 0.15), value: focused)
    }

    @ViewBuilder
    private var rightActionButton: some View {
        Group {
            if hasText {
                sendButton
                    .transition(.scale.combined(with: .opacity))
            } else {
                micButton
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: hasText)
    }

    private var sendButton: some View {
        Button(action: onSend) {
            Image(systemName: "paperplane.fill")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(LinearGradient.brand)
                .clipShape(Circle())
                .shadow(color: Color.brandViolet.opacity(0.5), radius: 12, x: 0, y: 5)
        }
        .buttonStyle(PressDownStyle())
    }

    private var micButton: some View {
        Button {
            Task { await recorder.start() }
        } label: {
            Image(systemName: "mic.fill")
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(.white.opacity(0.85))
                .frame(width: 40, height: 40)
                .background(Color.white.opacity(0.06))
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.08), lineWidth: 1))
        }
        .buttonStyle(PressDownStyle())
    }

    // MARK: - Recording UI

    private var cancelRecordButton: some View {
        Button {
            recorder.cancel()
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(Color(hex: 0xF43F5E).opacity(0.85))
                .clipShape(Circle())
        }
        .buttonStyle(PressDownStyle())
    }

    private var waveformPreview: some View {
        let bars = recorder.levels
        return HStack(spacing: 2) {
            ForEach(0..<bars.count, id: \.self) { i in
                Capsule()
                    .fill(Color(hex: 0xF43F5E))
                    .frame(width: 2.5, height: max(3, bars[i] * 28))
                    .opacity(0.45 + 0.55 * bars[i])
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 32)
        .padding(.horizontal, 10)
        .background(
            Capsule().fill(Color.white.opacity(0.04))
                .overlay(Capsule().stroke(Color.white.opacity(0.07), lineWidth: 1))
        )
    }

    private var sendRecordedButton: some View {
        Button {
            if let captured = recorder.stop() {
                onVoiceRecorded(captured.url, captured.duration, captured.waveform)
            }
        } label: {
            Image(systemName: "paperplane.fill")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(LinearGradient.brand)
                .clipShape(Circle())
                .shadow(color: Color.brandViolet.opacity(0.5), radius: 12, x: 0, y: 5)
        }
        .buttonStyle(PressDownStyle())
    }

    private func timeString(_ secs: TimeInterval) -> String {
        let s = Int(secs)
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}
