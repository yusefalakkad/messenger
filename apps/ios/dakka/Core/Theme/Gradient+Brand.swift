import SwiftUI

extension LinearGradient {
    /// Главный бренд-градиент: violet → fuchsia → orange.
    /// Используется для кнопок, лого-плитки, активной полоски, бейджей.
    static let brand = LinearGradient(
        colors: [.brandViolet, .brandFuchsia, .brandOrange],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Текст-градиент для заголовков ("чувствуешь").
    static let brandText = LinearGradient(
        colors: [
            Color(hex: 0xB794FF),
            Color(hex: 0xFF6DBB),
            .brandOrange
        ],
        startPoint: .leading,
        endPoint: .trailing
    )

    /// Тёмная карточка с тонким brand-подсветом (для glass-card).
    static let glassCard = LinearGradient(
        colors: [
            Color.white.opacity(0.045),
            Color.white.opacity(0.02)
        ],
        startPoint: .top,
        endPoint: .bottom
    )

    /// Исходящий пузырёк сообщения.
    static let outBubble = LinearGradient(
        colors: [
            Color(hex: 0x6A3DF0),
            Color(hex: 0x9A3DFF),
            Color(hex: 0xD946A8)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

extension RadialGradient {
    /// Ambient-пятна для фона — фиолетовое и розовое.
    static let ambientViolet = RadialGradient(
        colors: [Color.brandViolet.opacity(0.3), .clear],
        center: .center, startRadius: 0, endRadius: 260
    )
    static let ambientPink = RadialGradient(
        colors: [Color.brandPink.opacity(0.25), .clear],
        center: .center, startRadius: 0, endRadius: 260
    )
    static let ambientOrange = RadialGradient(
        colors: [Color.brandOrange.opacity(0.22), .clear],
        center: .center, startRadius: 0, endRadius: 200
    )
}
