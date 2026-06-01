import SwiftUI

struct TwoFactorView: View {
    @StateObject private var vm = TwoFactorViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            AmbientBackground()

            ScrollView {
                VStack(spacing: 20) {
                    closeBar

                    switch vm.step {
                    case .loading:
                        ProgressView().tint(.brandViolet).padding(60)

                    case .setupIntro:
                        introCard

                    case .scanQR(let secret, let url):
                        qrCard(secret: secret, url: url)

                    case .enterCode:
                        enterCodeCard(isEnable: true)

                    case .recoveryCodes(let codes):
                        recoveryCard(codes: codes)

                    case .enabledView:
                        enabledCard

                    case .disablePrompt:
                        disableCard
                    }

                    if let error = vm.error {
                        Text(error)
                            .font(Typo.small)
                            .foregroundStyle(Color(hex: 0xFCA5A5))
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .background(Color(hex: 0xF43F5E).opacity(0.1))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: 0xF43F5E).opacity(0.3), lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }

                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 30)
            }
        }
        .preferredColorScheme(.dark)
        .task { await vm.loadStatus() }
    }

    // MARK: - Close bar

    private var closeBar: some View {
        HStack {
            Text("Двухфакторная защита").font(Typo.titleM).foregroundStyle(.white)
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
        .padding(.top, 10)
    }

    // MARK: - Step 1: Intro (2FA выкл)

    private var introCard: some View {
        VStack(spacing: 18) {
            heroIcon(system: "shield.lefthalf.filled")

            VStack(spacing: 6) {
                Text("Включи двухфакторную защиту")
                    .font(Typo.titleM)
                    .foregroundStyle(.white)
                Text("Даже зная твой пароль, никто не сможет войти без кода из приложения-аутентификатора")
                    .font(Typo.body)
                    .foregroundStyle(.white.opacity(0.55))
                    .multilineTextAlignment(.center)
            }

            steps(items: [
                ("1.circle.fill", "Установи Google Authenticator, 1Password, Authy или аналог"),
                ("2.circle.fill", "Сосканируй QR-код или впиши секрет вручную"),
                ("3.circle.fill", "Введи 6-значный код для проверки"),
                ("4.circle.fill", "Сохрани recovery-коды в надёжном месте"),
            ])

            BrandButton(action: vm.beginSetup, isLoading: vm.processing) {
                Text("Включить")
            }
        }
        .padding(20)
        .glassCard()
    }

    // MARK: - Step 2: QR

    private func qrCard(secret: String, url: String) -> some View {
        VStack(spacing: 16) {
            Text("Сосканируй QR в аутентификаторе")
                .font(Typo.titleM)
                .foregroundStyle(.white)

            if let img = vm.qrImage(for: url) {
                Image(uiImage: img)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: 220, height: 220)
                    .padding(12)
                    .background(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            VStack(spacing: 6) {
                Text("Или введи секрет вручную:")
                    .font(Typo.small)
                    .foregroundStyle(.white.opacity(0.55))
                HStack {
                    Text(secret)
                        .font(.system(size: 14, weight: .semibold).monospaced())
                        .foregroundStyle(.white)
                        .padding(.vertical, 10).padding(.horizontal, 12)
                        .frame(maxWidth: .infinity)
                        .background(Color.white.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.07), lineWidth: 1))
                    Button {
                        SensitiveClipboard.copy(secret)
                    } label: {
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.7))
                            .frame(width: 38, height: 38)
                            .background(Color.white.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }

            BrandButton(action: vm.proceedToCodeEntry) {
                Text("Дальше")
            }
        }
        .padding(20)
        .glassCard()
    }

    // MARK: - Step 3: Enter code

    private func enterCodeCard(isEnable: Bool) -> some View {
        VStack(spacing: 14) {
            heroIcon(system: "lock.shield.fill")
            Text("Введи код из аутентификатора")
                .font(Typo.titleM).foregroundStyle(.white)
            Text("Код обновляется каждые 30 секунд")
                .font(Typo.small).foregroundStyle(.white.opacity(0.5))

            BrandTextField(
                title: "Код (6 цифр)",
                text: $vm.code,
                placeholder: "123456",
                keyboardType: .numberPad,
                textContentType: .oneTimeCode
            )

            BrandButton(action: vm.confirmEnable, isLoading: vm.processing,
                        isDisabled: vm.code.count < 6) {
                Text("Подтвердить")
            }
        }
        .padding(20)
        .glassCard()
    }

    // MARK: - Step 4: Recovery codes

    private func recoveryCard(codes: [String]) -> some View {
        VStack(spacing: 14) {
            heroIcon(system: "key.fill")
            Text("2FA включена!")
                .font(Typo.titleM)
                .foregroundStyle(.white)
            Text("Сохрани recovery-коды — каждый можно использовать один раз для входа без аутентификатора")
                .font(Typo.body)
                .foregroundStyle(.white.opacity(0.55))
                .multilineTextAlignment(.center)

            VStack(spacing: 6) {
                ForEach(codes, id: \.self) { c in
                    Text(c)
                        .font(.system(size: 14, weight: .semibold).monospaced())
                        .foregroundStyle(.white)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .background(Color.white.opacity(0.06))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.07), lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }

            GhostButton(action: {
                SensitiveClipboard.copy(codes.joined(separator: "\n"))
            }) {
                HStack {
                    Image(systemName: "doc.on.doc")
                    Text("Скопировать все коды")
                }
            }

            BrandButton(action: { dismiss() }) {
                Text("Готово")
            }
        }
        .padding(20)
        .glassCard()
    }

    // MARK: - Enabled view

    private var enabledCard: some View {
        VStack(spacing: 16) {
            heroIcon(system: "checkmark.shield.fill")
            Text("2FA активна")
                .font(Typo.titleM)
                .foregroundStyle(.white)
            Text("Защита включена. При входе ты вводишь код из аутентификатора.")
                .font(Typo.body)
                .foregroundStyle(.white.opacity(0.55))
                .multilineTextAlignment(.center)

            Button(role: .destructive, action: vm.startDisable) {
                HStack {
                    Image(systemName: "shield.slash.fill")
                    Text("Отключить 2FA")
                        .font(Typo.bodyM)
                }
                .foregroundStyle(Color(hex: 0xFCA5A5))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color(hex: 0xF43F5E).opacity(0.12))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: 0xF43F5E).opacity(0.3), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(PressDownStyle())
        }
        .padding(20)
        .glassCard()
    }

    // MARK: - Disable form

    private var disableCard: some View {
        VStack(spacing: 14) {
            heroIcon(system: "exclamationmark.shield.fill")
            Text("Отключить 2FA")
                .font(Typo.titleM).foregroundStyle(.white)
            Text("Подтверди паролем и кодом из аутентификатора")
                .font(Typo.body).foregroundStyle(.white.opacity(0.55))
                .multilineTextAlignment(.center)

            BrandTextField(
                title: "Пароль",
                text: $vm.password,
                placeholder: "••••••••",
                isSecure: true,
                textContentType: .password
            )

            BrandTextField(
                title: "Код (6 цифр)",
                text: $vm.code,
                placeholder: "123456",
                keyboardType: .numberPad,
                textContentType: .oneTimeCode
            )

            BrandButton(action: vm.confirmDisable, isLoading: vm.processing,
                        isDisabled: vm.code.count < 6 || vm.password.isEmpty) {
                Text("Отключить")
            }
        }
        .padding(20)
        .glassCard()
    }

    // MARK: - Helpers

    private func heroIcon(system: String) -> some View {
        ZStack {
            Circle().fill(LinearGradient.brand)
                .frame(width: 92, height: 92)
                .blur(radius: 20).opacity(0.45)
            Circle()
                .fill(LinearGradient.brand)
                .frame(width: 80, height: 80)
            Image(systemName: system)
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(.white)
        }
    }

    private func steps(items: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(items.indices, id: \.self) { i in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: items[i].0)
                        .foregroundStyle(Color.brandViolet)
                    Text(items[i].1)
                        .font(Typo.small)
                        .foregroundStyle(.white.opacity(0.75))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 6)
    }
}
