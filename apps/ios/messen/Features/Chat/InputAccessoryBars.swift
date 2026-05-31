import SwiftUI

/// Полоска "Ответ на сообщение" над инпутом.
struct ReplyBar: View {
    let preview: String
    let authorName: String
    let onCancel: () -> Void

    var body: some View {
        bar(icon: "arrowshape.turn.up.left.fill", title: authorName, preview: preview, onCancel: onCancel)
    }
}

/// Полоска "Редактирование" над инпутом.
struct EditBar: View {
    let preview: String
    let onCancel: () -> Void

    var body: some View {
        bar(icon: "pencil", title: "Редактирование", preview: preview, onCancel: onCancel)
    }
}

private func bar(icon: String, title: String, preview: String, onCancel: @escaping () -> Void) -> some View {
    HStack(spacing: 10) {
        Image(systemName: icon)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Color.brandViolet)
        Rectangle()
            .fill(LinearGradient.brand)
            .frame(width: 3)
            .clipShape(Capsule())
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Color.brandViolet)
            Text(preview)
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.55))
                .lineLimit(1)
        }
        Spacer()
        Button(action: onCancel) {
            Image(systemName: "xmark")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.6))
                .frame(width: 26, height: 26)
                .background(Color.white.opacity(0.05))
                .clipShape(Circle())
        }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .background(Color.brandViolet.opacity(0.08))
    .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.05)), alignment: .top)
}
