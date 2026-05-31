import SwiftUI

/// Pill с эмодзи для быстрых реакций — показывается на long-press по сообщению.
struct ReactionPicker: View {
    let onPick: (String) -> Void
    let onMore: () -> Void

    private let quick: [String] = ["❤️", "👍", "😂", "😮", "😢", "🔥"]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(quick, id: \.self) { emoji in
                Button {
                    onPick(emoji)
                } label: {
                    Text(emoji)
                        .font(.system(size: 24))
                        .padding(6)
                }
                .buttonStyle(PressDownStyle())
            }
            Button(action: onMore) {
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 32, height: 32)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())
            }
            .buttonStyle(PressDownStyle())
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
            Color.darkSurface.opacity(0.85)
                .background(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: .black.opacity(0.5), radius: 24, x: 0, y: 12)
    }
}

/// Бар существующих реакций под пузырьком.
struct ReactionsBar: View {
    let reactions: [Reaction]
    let currentUserId: String?
    let onToggle: (String) -> Void

    /// Группируем эмодзи: { "❤️": (count: 3, mine: true) }
    private var grouped: [(emoji: String, count: Int, mine: Bool)] {
        var dict: [String: (count: Int, mine: Bool)] = [:]
        for r in reactions {
            var current = dict[r.emoji] ?? (0, false)
            current.count += 1
            if r.userId == currentUserId { current.mine = true }
            dict[r.emoji] = current
        }
        return dict.map { (emoji: $0.key, count: $0.value.count, mine: $0.value.mine) }
            .sorted { $0.count > $1.count }
    }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(grouped, id: \.emoji) { item in
                Button {
                    onToggle(item.emoji)
                } label: {
                    HStack(spacing: 3) {
                        Text(item.emoji).font(.system(size: 12))
                        if item.count > 1 {
                            Text("\(item.count)")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(item.mine ? Color.brandViolet : .white.opacity(0.7))
                        }
                    }
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(
                        Capsule().fill(item.mine
                                       ? Color.brandViolet.opacity(0.25)
                                       : Color.white.opacity(0.05))
                    )
                    .overlay(
                        Capsule().stroke(item.mine
                                         ? Color.brandViolet.opacity(0.5)
                                         : Color.white.opacity(0.07), lineWidth: 1)
                    )
                }
                .buttonStyle(PressDownStyle())
            }
        }
    }
}
