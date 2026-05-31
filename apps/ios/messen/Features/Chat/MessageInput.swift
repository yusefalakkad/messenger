import SwiftUI

struct MessageInput: View {
    @Binding var text: String
    let onSend: () -> Void
    let onTextChanged: () -> Void

    @FocusState private var focused: Bool

    private var hasText: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            attachButton

            inputField

            sendButton
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
    }

    // MARK: - Pieces

    private var attachButton: some View {
        Button {
            // TODO: media attach
        } label: {
            Image(systemName: "paperclip")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(.white.opacity(0.55))
                .padding(8)
        }
        .buttonStyle(PressDownStyle())
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
    private var sendButton: some View {
        Group {
            if hasText {
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
                .transition(.scale.combined(with: .opacity))
            } else {
                Button {
                    // TODO: PTT recorder
                } label: {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(.white.opacity(0.7))
                        .frame(width: 40, height: 40)
                        .background(Color.white.opacity(0.06))
                        .clipShape(Circle())
                        .overlay(Circle().stroke(Color.white.opacity(0.07), lineWidth: 1))
                }
                .buttonStyle(PressDownStyle())
                .transition(.scale.combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: hasText)
    }
}
