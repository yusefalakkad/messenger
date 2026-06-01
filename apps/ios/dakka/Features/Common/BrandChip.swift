import SwiftUI

/// Пилюля с тонкой brand-обводкой и стеклянным фоном.
/// Используется для бейджей "Приватность по умолчанию · E2E".
struct BrandChip<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack(spacing: 6) {
            content()
        }
        .font(Typo.smallM)
        .foregroundStyle(.white.opacity(0.9))
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Color.white.opacity(0.04)
                .background(.ultraThinMaterial)
        )
        .clipShape(Capsule())
        .overlay(
            Capsule().strokeBorder(LinearGradient.brand, lineWidth: 1)
        )
    }
}

/// Стеклянная карточка — фон + рамка + блюр.
struct GlassCard: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                ZStack {
                    Color.white.opacity(0.025)
                    LinearGradient.glassCard
                }
                .background(.ultraThinMaterial)
            )
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Color.white.opacity(0.07), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.5), radius: 30, x: 0, y: 22)
    }
}

extension View {
    func glassCard() -> some View { modifier(GlassCard()) }
}
