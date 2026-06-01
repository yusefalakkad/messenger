import SwiftUI

/// Один toast — карточка с иконкой и текстом.
struct ToastView: View {
    let item: ToastItem
    let onDismiss: () -> Void

    private var iconName: String {
        switch item.kind {
        case .error:   return "xmark.circle.fill"
        case .success: return "checkmark.circle.fill"
        case .info:    return "info.circle.fill"
        }
    }

    private var accent: Color {
        switch item.kind {
        case .error:   return Color(hex: 0xF43F5E)
        case .success: return Color(hex: 0x34D399)
        case .info:    return Color.brandViolet
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: iconName)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(accent)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(Typo.bodyB)
                    .foregroundStyle(.white)
                if let msg = item.message {
                    Text(msg)
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.65))
                        .lineLimit(3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.55))
                    .frame(width: 28, height: 28)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(
            ZStack {
                Color.darkSurface.opacity(0.85)
                accent.opacity(0.08)
            }
            .background(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(accent.opacity(0.35), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.5), radius: 16, x: 0, y: 8)
        .padding(.horizontal, 16)
    }
}

/// Хост-оверлей, который сидит на корне RootView и показывает toast'ы.
struct ToastHost: View {
    @ObservedObject private var center = ToastCenter.shared

    var body: some View {
        VStack {
            if let item = center.current {
                ToastView(item: item, onDismiss: { center.dismiss() })
                    .padding(.top, 6)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .gesture(
                        DragGesture(minimumDistance: 8)
                            .onEnded { value in
                                if value.translation.height < -20 {
                                    center.dismiss()
                                }
                            }
                    )
            }
            Spacer()
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.78), value: center.current)
        .allowsHitTesting(center.current != nil)
    }
}
