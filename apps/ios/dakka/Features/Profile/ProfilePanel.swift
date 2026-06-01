import SwiftUI

/// Карточка профиля собеседника (direct) или участников (группа).
struct ProfilePanel: View {
    let chat: Chat
    let currentUserId: String?
    let onStartAudioCall: () -> Void
    let onStartVideoCall: () -> Void
    @Environment(\.dismiss) private var dismiss

    private var otherMember: ChatMember? {
        chat.members.first(where: { $0.userId != currentUserId })
    }

    var body: some View {
        ZStack {
            AmbientBackground()

            ScrollView {
                VStack(spacing: 24) {
                    closeButtonBar
                    hero
                    if chat.type == .direct {
                        directInfo
                    } else {
                        groupInfo
                    }
                    Spacer(minLength: 40)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Close

    private var closeButtonBar: some View {
        HStack {
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 16).padding(.top, 12)
    }

    // MARK: - Hero

    private var hero: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle().fill(LinearGradient.brand)
                    .frame(width: 160, height: 160)
                    .blur(radius: 30).opacity(0.45)
                Avatar(
                    url: chat.displayAvatar(currentUserId: currentUserId),
                    name: chat.displayName(currentUserId: currentUserId),
                    size: 130, withGradientRing: true
                )
                .frame(width: 140, height: 140)
            }

            VStack(spacing: 4) {
                Text(chat.displayName(currentUserId: currentUserId))
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(.white)
                if chat.type == .direct, let other = otherMember {
                    Text("@\(other.user.username)")
                        .font(Typo.body).foregroundStyle(.white.opacity(0.5))
                }
            }

            if chat.type == .direct, let other = otherMember {
                Text(other.user.status == "online" ? "в сети" : "не в сети")
                    .font(Typo.small)
                    .foregroundStyle(other.user.status == "online" ? Color(hex: 0x34D399) : Color.white.opacity(0.45))
            }

            if isE2EReady {
                BrandChip {
                    Image(systemName: "checkmark.shield.fill").font(.system(size: 11))
                        .foregroundStyle(Color.brandViolet)
                    Text("Сквозное шифрование")
                }
            }
        }
    }

    private var isE2EReady: Bool {
        chat.type == .direct &&
        chat.members.allSatisfy { ($0.user.publicKey ?? "").isEmpty == false }
    }

    // MARK: - Direct info + actions

    private var directInfo: some View {
        VStack(spacing: 14) {
            HStack(spacing: 14) {
                actionButton(icon: "phone.fill", label: "Аудио") {
                    dismiss()
                    onStartAudioCall()
                }
                actionButton(icon: "video.fill", label: "Видео") {
                    dismiss()
                    onStartVideoCall()
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func actionButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(LinearGradient.brand)
                    .clipShape(Circle())
                    .shadow(color: Color.brandViolet.opacity(0.5), radius: 14, x: 0, y: 6)
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.85))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.white.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.white.opacity(0.06), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(PressDownStyle())
    }

    // MARK: - Group info

    private var groupInfo: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("\(chat.members.count) участн.")
                .font(Typo.smallM)
                .foregroundStyle(.white.opacity(0.5))
                .textCase(.uppercase)
                .kerning(1)
                .padding(.horizontal, 20)

            VStack(spacing: 6) {
                ForEach(chat.members, id: \.userId) { member in
                    HStack(spacing: 12) {
                        Avatar(url: member.user.avatar, name: member.user.displayName, size: 38,
                               online: member.user.status == "online")
                        VStack(alignment: .leading, spacing: 1) {
                            Text(member.user.displayName)
                                .font(Typo.bodyB)
                                .foregroundStyle(.white)
                            if let role = member.role, role != "member" {
                                Text(role)
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(Color.brandViolet)
                                    .textCase(.uppercase)
                            } else {
                                Text("@\(member.user.username)")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.white.opacity(0.45))
                            }
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(Color.white.opacity(0.03))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.06), lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
            .padding(.horizontal, 16)
        }
    }
}
