import SwiftUI

struct ChatListRow: View {
    let chat: Chat
    let currentUserId: String?
    var active: Bool = false

    private static let relFmt: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.unitsStyle = .short
        return f
    }()

    private var preview: String {
        guard let last = chat.lastMessage else { return "" }
        switch last.type {
        case "voice":  return "🎤 Голосовое"
        case "circle": return "⭕ Видео-кружок"
        case "image":  return "📷 Фото"
        case "video":  return "🎬 Видео"
        case "file":   return "📎 Файл"
        default:       return last.content ?? ""
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            // Активная градиентная полоска
            if active {
                Capsule()
                    .fill(LinearGradient.brand)
                    .frame(width: 3)
                    .padding(.vertical, 4)
                    .shadow(color: Color.brandViolet.opacity(0.6), radius: 6)
            } else {
                Color.clear.frame(width: 3)
            }

            Avatar(
                url: chat.displayAvatar(currentUserId: currentUserId),
                name: chat.displayName(currentUserId: currentUserId),
                size: 48,
                online: chat.type == .direct ? chat.isOnline(currentUserId: currentUserId) : nil
            )

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(chat.displayName(currentUserId: currentUserId))
                        .font(Typo.bodyB)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    if chat.isMuted(currentUserId: currentUserId) {
                        Image(systemName: "bell.slash.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.4))
                    }
                    Spacer(minLength: 6)
                    if let date = chat.lastMessage?.createdAt {
                        Text(Self.relFmt.localizedString(for: date, relativeTo: Date()))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.white.opacity(0.35))
                    }
                }
                HStack {
                    Text(preview)
                        .font(Typo.small)
                        .foregroundStyle(.white.opacity(0.5))
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    if let unread = chat.unreadCount, unread > 0 {
                        Text("\(unread)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(LinearGradient.brand)
                            .clipShape(Capsule())
                            .shadow(color: Color.brandViolet.opacity(0.6), radius: 8, y: 2)
                    }
                }
            }
        }
        .padding(.vertical, 10)
        .padding(.trailing, 12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(active ? Color.white.opacity(0.07) : Color.clear)
        )
        .contentShape(Rectangle())
    }
}
