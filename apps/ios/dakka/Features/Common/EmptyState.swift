import SwiftUI

/// Унифицированный empty-state: иконка с brand-glow + заголовок + подпись + опциональная CTA.
struct EmptyState<CTA: View>: View {
    let iconName: String
    let title: String
    let subtitle: String?
    @ViewBuilder let cta: () -> CTA

    init(
        iconName: String,
        title: String,
        subtitle: String? = nil,
        @ViewBuilder cta: @escaping () -> CTA = { EmptyView() }
    ) {
        self.iconName = iconName
        self.title = title
        self.subtitle = subtitle
        self.cta = cta
    }

    var body: some View {
        VStack(spacing: 12) {
            // Brand-glow icon
            ZStack {
                Circle()
                    .fill(LinearGradient.brand)
                    .blur(radius: 18)
                    .opacity(0.35)
                    .frame(width: 70, height: 70)
                Circle()
                    .fill(Color.white.opacity(0.04))
                    .overlay(Circle().stroke(Color.white.opacity(0.08), lineWidth: 1))
                    .frame(width: 64, height: 64)
                Image(systemName: iconName)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(LinearGradient.brand)
            }

            Text(title)
                .font(Typo.bodyB)
                .foregroundStyle(.white.opacity(0.85))

            if let subtitle {
                Text(subtitle)
                    .font(Typo.small)
                    .foregroundStyle(.white.opacity(0.45))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            cta()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, 40)
    }
}
