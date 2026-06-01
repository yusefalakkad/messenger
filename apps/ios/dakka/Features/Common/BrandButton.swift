import SwiftUI

/// Главная brand-кнопка: градиент violet→pink→orange + свечение + spring-press.
struct BrandButton<Label: View>: View {
    let action: () -> Void
    let label: () -> Label
    var isLoading: Bool = false
    var isDisabled: Bool = false

    init(action: @escaping () -> Void,
         isLoading: Bool = false,
         isDisabled: Bool = false,
         @ViewBuilder label: @escaping () -> Label) {
        self.action = action
        self.isLoading = isLoading
        self.isDisabled = isDisabled
        self.label = label
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                }
                label()
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(LinearGradient.brand)
            .foregroundStyle(.white)
            .font(Typo.bodyB)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: Color.brandViolet.opacity(0.55), radius: 22, x: 0, y: 10)
            .opacity(isDisabled || isLoading ? 0.6 : 1)
        }
        .disabled(isDisabled || isLoading)
        .buttonStyle(PressDownStyle())
    }
}

/// Кнопка-призрак с тонкой обводкой.
struct GhostButton<Label: View>: View {
    let action: () -> Void
    @ViewBuilder let label: () -> Label

    var body: some View {
        Button(action: action) {
            label()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.white.opacity(0.05))
                .foregroundStyle(.white.opacity(0.85))
                .font(Typo.bodyM)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white.opacity(0.06), lineWidth: 1)
                )
        }
        .buttonStyle(PressDownStyle())
    }
}

struct PressDownStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .brightness(configuration.isPressed ? -0.04 : 0)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { pressed in
                if pressed {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }
    }
}
