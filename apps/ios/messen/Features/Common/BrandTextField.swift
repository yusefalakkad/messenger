import SwiftUI

/// Тёмный input в стиле бренда. Поддерживает password-режим (eye toggle) и автокапитализацию.
struct BrandTextField: View {
    let title: String
    @Binding var text: String
    var placeholder: String = ""
    var isSecure: Bool = false
    var autocapitalization: TextInputAutocapitalization = .never
    var keyboardType: UIKeyboardType = .default
    var textContentType: UITextContentType? = nil

    @State private var revealed = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(Typo.smallM)
                .foregroundStyle(.white.opacity(0.6))

            HStack(spacing: 8) {
                inputField

                if isSecure {
                    Button { revealed.toggle() } label: {
                        Image(systemName: revealed ? "eye.slash" : "eye")
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(.white.opacity(0.5))
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color.darkInput)
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(focused ? Color.brandViolet.opacity(0.7) : Color.white.opacity(0.07), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .animation(.easeOut(duration: 0.15), value: focused)
        }
    }

    @ViewBuilder
    private var inputField: some View {
        Group {
            if isSecure && !revealed {
                SecureField(placeholder, text: $text)
            } else {
                TextField(placeholder, text: $text)
                    .textInputAutocapitalization(autocapitalization)
                    .autocorrectionDisabled()
            }
        }
        .keyboardType(keyboardType)
        .textContentType(textContentType)
        .focused($focused)
        .font(Typo.body)
        .foregroundStyle(.white)
        .tint(.brandViolet)
    }
}
