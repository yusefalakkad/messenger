import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var showEditProfile = false
    @State private var show2FA = false

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    var body: some View {
        ZStack {
            AmbientBackground()

            ScrollView {
                VStack(spacing: 18) {
                    closeBar
                    userHero
                    sections
                    Spacer(minLength: 24)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 30)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showEditProfile) {
            EditProfileView()
                .environmentObject(auth)
                .presentationDetents([.large])
                .presentationBackground(.ultraThinMaterial)
        }
        .sheet(isPresented: $show2FA) {
            TwoFactorView()
                .presentationDetents([.large])
                .presentationBackground(.ultraThinMaterial)
        }
    }

    // MARK: - Pieces

    private var closeBar: some View {
        HStack {
            Text("Настройки")
                .font(Typo.titleM)
                .foregroundStyle(.white)
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())
            }
            .buttonStyle(PressDownStyle())
        }
        .padding(.top, 10)
    }

    private var userHero: some View {
        Button { showEditProfile = true } label: {
            HStack(spacing: 14) {
                Avatar(url: auth.user?.avatar,
                       name: auth.user?.displayName ?? "?",
                       size: 64,
                       withGradientRing: true)
                    .frame(width: 70, height: 70)
                VStack(alignment: .leading, spacing: 2) {
                    Text(auth.user?.displayName ?? "—")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                    Text("@\(auth.user?.username ?? "")")
                        .font(Typo.small)
                        .foregroundStyle(.white.opacity(0.5))
                    Text("Редактировать профиль")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(LinearGradient.brandText)
                        .padding(.top, 2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundStyle(.white.opacity(0.4))
            }
            .padding(14)
            .glassCard()
        }
        .buttonStyle(PressDownStyle())
    }

    private var sections: some View {
        VStack(spacing: 14) {
            section(title: "Приватность и безопасность") {
                row(icon: "shield.lefthalf.filled", title: "E2E включено по умолчанию",
                    accessory: chip("ВКЛ", color: Color.brandViolet))
                Button { show2FA = true } label: {
                    row(icon: "lock.fill", title: "Двухфакторная защита",
                        accessory: chevronAccessory)
                }
                .buttonStyle(PressDownStyle())
                row(icon: "key.fill", title: "Активные сессии",
                    accessory: chip("СКОРО", color: Color.white.opacity(0.4)))
            }

            section(title: "Уведомления") {
                row(icon: "bell.fill", title: "Push-уведомления",
                    accessory: chip(notifAccessory, color: Color(hex: 0x34D399)))
                row(icon: "speaker.wave.2.fill", title: "Звук сообщений",
                    accessory: chip("ВКЛ", color: Color(hex: 0x34D399)))
            }

            section(title: "О приложении") {
                row(icon: "info.circle.fill", title: "Версия", accessory: Text(appVersion)
                    .font(Typo.smallM).foregroundStyle(.white.opacity(0.5)).asAny())
                row(icon: "globe", title: "akkdmsg.online", accessory: Image(systemName: "arrow.up.right")
                    .foregroundStyle(.white.opacity(0.4)).asAny())
            }

            Button(role: .destructive) {
                auth.logout()
                dismiss()
            } label: {
                HStack {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                    Text("Выйти из аккаунта")
                        .font(Typo.bodyM)
                }
                .foregroundStyle(Color(hex: 0xFCA5A5))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color(hex: 0xF43F5E).opacity(0.12))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: 0xF43F5E).opacity(0.3), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .padding(.top, 8)
        }
    }

    private var notifAccessory: String {
        // На реальном устройстве через PushManager было бы видно фактическое разрешение
        "ВКЛ"
    }

    private func section<C: View>(title: String, @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .kerning(1.2)
                .foregroundStyle(.white.opacity(0.45))
                .padding(.leading, 14).padding(.top, 8)
            VStack(spacing: 0) {
                content()
            }
            .background(Color.white.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.05), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private func row(icon: String, title: String, accessory: AnyView) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.brandViolet)
                .frame(width: 28, height: 28)
                .background(Color.brandViolet.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            Text(title)
                .font(Typo.body)
                .foregroundStyle(.white.opacity(0.95))
            Spacer()
            accessory
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.04)), alignment: .top)
    }

    private var chevronAccessory: AnyView {
        AnyView(
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.4))
        )
    }

    private func chip(_ text: String, color: Color) -> AnyView {
        AnyView(
            Text(text)
                .font(.system(size: 10, weight: .bold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(color.opacity(0.18))
                .overlay(Capsule().stroke(color.opacity(0.4), lineWidth: 1))
                .foregroundStyle(color)
                .clipShape(Capsule())
        )
    }
}

extension View {
    fileprivate func asAny() -> AnyView { AnyView(self) }
}
