import SwiftUI

/// Shimmer-плейсхолдер. Используется вместо ProgressView во время загрузки —
/// сразу даёт юзеру понимание формы контента.
struct Skeleton: View {
    var width: CGFloat? = nil
    var height: CGFloat = 14
    var cornerRadius: CGFloat = 6

    @State private var phase: CGFloat = -1.0

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.white.opacity(0.05))
            .overlay(
                LinearGradient(
                    colors: [.clear, Color.white.opacity(0.12), .clear],
                    startPoint: .leading, endPoint: .trailing
                )
                .frame(width: (width ?? 200) * 0.6)
                .offset(x: (width ?? 200) * phase)
            )
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .onAppear {
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                    phase = 1.5
                }
            }
    }
}

/// Skeleton-ряд для списка чатов.
struct ChatRowSkeleton: View {
    var body: some View {
        HStack(spacing: 12) {
            Color.clear.frame(width: 3)
            Circle()
                .fill(Color.white.opacity(0.05))
                .frame(width: 48, height: 48)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Skeleton(width: 130, height: 13)
                    Spacer()
                    Skeleton(width: 36, height: 10)
                }
                Skeleton(width: 180, height: 11)
            }
        }
        .padding(.vertical, 10).padding(.horizontal, 12)
    }
}

/// Skeleton-пузырёк для входящих сообщений.
struct MessageBubbleSkeleton: View {
    let isOwn: Bool
    let width: CGFloat

    var body: some View {
        HStack {
            if isOwn { Spacer(minLength: 40) }
            if !isOwn {
                Circle().fill(Color.white.opacity(0.05))
                    .frame(width: 30, height: 30)
            }
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.06))
                .overlay(
                    LinearGradient(
                        colors: [.clear, Color.white.opacity(0.08), .clear],
                        startPoint: .leading, endPoint: .trailing
                    )
                    .scaleEffect(x: 0.5, y: 1, anchor: .leading)
                )
                .frame(width: width, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            if !isOwn { Spacer(minLength: 40) }
        }
        .padding(.vertical, 2)
    }
}
