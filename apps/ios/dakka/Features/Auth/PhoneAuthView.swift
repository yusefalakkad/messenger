import SwiftUI

/// Phone+OTP auth — единый поток как в Telegram.
/// Шаги: phone → (опц.) link-bot → code → (только новый юзер) profile.
struct PhoneAuthView: View {
    @EnvironmentObject private var auth: AuthStore

    enum Step: Equatable {
        case phone
        case linkBot(deepLink: String)
        case code(devHint: String?)
        case profile(verifyToken: String)
    }

    @State private var step: Step = .phone

    @State private var phone: String = ""
    @State private var code: String = ""
    @State private var displayName: String = ""
    @State private var username: String = ""

    @State private var loading = false
    @State private var errorMessage: String? = nil
    @State private var resendIn: Int = 0
    @State private var resendTimer: Timer? = nil

    @FocusState private var focusedField: Field?
    enum Field: Hashable { case phone, code, displayName, username }

    var body: some View {
        VStack(spacing: 18) {
            switch step {
            case .phone:                    phoneStep
            case .linkBot(let link):        linkBotStep(deepLink: link)
            case .code(let devHint):        codeStep(devHint: devHint)
            case .profile:                  profileStep
            }
        }
        .animation(.spring(response: 0.5, dampingFraction: 0.85), value: step)
        .onAppear { focusedField = .phone }
        .onDisappear { resendTimer?.invalidate() }
    }

    // MARK: - Step 1: phone

    private var phoneStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Введите ваш номер")
                .font(Typo.titleM)
                .foregroundStyle(.white)

            Text("Мы отправим одноразовый код через Telegram.")
                .font(Typo.small)
                .foregroundStyle(.white.opacity(0.5))

            FieldShell(systemImage: "phone.fill") {
                TextField("+7 999 123-45-67", text: $phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .focused($focusedField, equals: .phone)
                    .foregroundStyle(.white)
            }

            errorBlock

            BrandSubmit(
                title: "Отправить код",
                systemIcon: "arrow.right",
                loading: loading,
                disabled: phone.trimmingCharacters(in: .whitespaces).count < 5
            ) { Task { await requestCode() } }
        }
    }

    // MARK: - Step 2 (опц.): открыть бота

    private func linkBotStep(deepLink: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Button {
                step = .phone
                code = ""
                errorMessage = nil
            } label: {
                Text("← Сменить номер")
                    .font(Typo.tiny)
                    .foregroundStyle(.white.opacity(0.45))
            }
            .buttonStyle(.plain)

            Text("Откройте Dakka-бот в Telegram")
                .font(Typo.titleM)
                .foregroundStyle(.white)

            Text("Это разовое действие. Откройте бота, нажмите «Start», затем поделитесь номером. Код придёт прямо в этот чат.")
                .font(Typo.small)
                .foregroundStyle(.white.opacity(0.55))

            Button {
                if let url = URL(string: deepLink) {
                    UIApplication.shared.open(url)
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "paperplane.fill")
                    Text("Открыть Telegram")
                }
                .font(Typo.bodyM.weight(.medium))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Color(red: 0.13, green: 0.62, blue: 0.85))
                        .shadow(color: Color(red: 0.13, green: 0.62, blue: 0.85).opacity(0.45), radius: 16, y: 6)
                )
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 6) {
                stepRow(num: 1, text: "Telegram откроется — нажмите «Start»")
                stepRow(num: 2, text: "Бот покажет кнопку «Поделиться номером» — нажмите её")
                stepRow(num: 3, text: "В чате с ботом появится код")
                stepRow(num: 4, text: "Вернитесь сюда и нажмите «У меня есть код»")
            }
            .padding(.top, 4)

            errorBlock

            BrandSubmit(
                title: "У меня есть код",
                systemIcon: "arrow.right",
                loading: false,
                disabled: false
            ) {
                step = .code(devHint: nil)
                code = ""
                focusedField = .code
            }
        }
    }

    private func stepRow(num: Int, text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(num).")
                .font(Typo.tiny.weight(.semibold))
                .foregroundStyle(.white.opacity(0.85))
                .frame(width: 18, alignment: .leading)
            Text(text)
                .font(Typo.tiny)
                .foregroundStyle(.white.opacity(0.55))
        }
    }

    // MARK: - Step 3: code

    private func codeStep(devHint: String?) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Button {
                step = .phone
                code = ""
                errorMessage = nil
            } label: {
                Text("← Сменить номер")
                    .font(Typo.tiny)
                    .foregroundStyle(.white.opacity(0.45))
            }
            .buttonStyle(.plain)

            Text("Введите код")
                .font(Typo.titleM)
                .foregroundStyle(.white)

            (Text("Мы отправили код на ").foregroundColor(.white.opacity(0.5))
             + Text(phone).foregroundColor(.white.opacity(0.85)))
                .font(Typo.small)

            if let hint = devHint {
                HStack(spacing: 6) {
                    Image(systemName: "info.circle")
                    (Text("Dev-режим: код ")
                     + Text(hint).font(.system(size: 11, weight: .semibold, design: .monospaced)))
                        .font(Typo.tiny)
                }
                .foregroundStyle(Color.orange.opacity(0.9))
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Color.orange.opacity(0.08))
                        .overlay(
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .stroke(Color.orange.opacity(0.22), lineWidth: 1)
                        )
                )
            }

            FieldShell(systemImage: "key.fill") {
                TextField("123 456", text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .focused($focusedField, equals: .code)
                    .foregroundStyle(.white)
                    .font(.system(size: 22, weight: .semibold, design: .monospaced))
                    .tracking(8)
                    .onChange(of: code) { newValue in
                        code = newValue.filter(\.isNumber).prefix(8).description
                    }
            }

            errorBlock

            BrandSubmit(
                title: "Подтвердить",
                systemIcon: "arrow.right",
                loading: loading,
                disabled: code.count < 4
            ) { Task { await verifyCode() } }

            Button {
                Task { await resendCode() }
            } label: {
                Text(resendIn > 0 ? "Отправить новый код можно через \(resendIn)s" : "Отправить новый код")
                    .font(Typo.tiny)
                    .foregroundStyle(resendIn > 0 ? .white.opacity(0.3) : .white.opacity(0.55))
                    .frame(maxWidth: .infinity)
            }
            .disabled(resendIn > 0 || loading)
            .buttonStyle(.plain)
        }
    }

    // MARK: - Step 4 (только для новых юзеров): profile

    private var profileStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Расскажите о себе")
                .font(Typo.titleM)
                .foregroundStyle(.white)

            Text("Эти данные увидят люди, с которыми вы переписываетесь.")
                .font(Typo.small)
                .foregroundStyle(.white.opacity(0.5))

            VStack(alignment: .leading, spacing: 6) {
                Text("Имя").font(Typo.tiny).foregroundStyle(.white.opacity(0.55))
                FieldShell(systemImage: "person.fill") {
                    TextField("Иван Иванов", text: $displayName)
                        .focused($focusedField, equals: .displayName)
                        .textContentType(.name)
                        .foregroundStyle(.white)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Username — необязательно").font(Typo.tiny).foregroundStyle(.white.opacity(0.55))
                FieldShell(systemImage: "at") {
                    TextField("ivan", text: $username)
                        .focused($focusedField, equals: .username)
                        .autocapitalization(.none)
                        .autocorrectionDisabled(true)
                        .foregroundStyle(.white)
                        .onChange(of: username) { newValue in
                            username = newValue.filter { $0.isLetter || $0.isNumber || $0 == "_" }
                                                .prefix(32).description
                        }
                }
            }

            errorBlock

            BrandSubmit(
                title: "Готово",
                systemIcon: "arrow.right",
                loading: loading,
                disabled: displayName.trimmingCharacters(in: .whitespaces).isEmpty
            ) { Task { await completeProfile() } }
        }
        .onAppear { focusedField = .displayName }
    }

    // MARK: - Common pieces

    @ViewBuilder
    private var errorBlock: some View {
        if let err = errorMessage {
            Text(err)
                .font(Typo.tiny)
                .foregroundStyle(Color.red.opacity(0.85))
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Color.red.opacity(0.08))
                        .overlay(
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .stroke(Color.red.opacity(0.22), lineWidth: 1)
                        )
                )
                .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }

    // MARK: - Actions

    @MainActor
    private func requestCode() async {
        errorMessage = nil
        loading = true
        defer { loading = false }
        do {
            let r = try await AuthService.phoneRequestCode(phone: phone.trimmingCharacters(in: .whitespaces))
            startResendCooldown(r.cooldownSec)
            if let dl = r.telegramDeepLink {
                step = .linkBot(deepLink: dl)
            } else {
                step = .code(devHint: r.devOtp)
                focusedField = .code
            }
        } catch {
            errorMessage = friendlyError(error) ?? "Не удалось отправить код"
        }
    }

    @MainActor
    private func resendCode() async {
        guard resendIn == 0, !loading else { return }
        errorMessage = nil
        loading = true
        defer { loading = false }
        do {
            let r = try await AuthService.phoneRequestCode(phone: phone.trimmingCharacters(in: .whitespaces))
            startResendCooldown(r.cooldownSec)
            if let dl = r.telegramDeepLink {
                step = .linkBot(deepLink: dl)
            } else if case .code = step {
                step = .code(devHint: r.devOtp)
            }
        } catch {
            errorMessage = friendlyError(error) ?? "Не удалось переслать код"
        }
    }

    @MainActor
    private func verifyCode() async {
        errorMessage = nil
        loading = true
        defer { loading = false }
        do {
            let r = try await AuthService.phoneVerifyCode(
                phone: phone.trimmingCharacters(in: .whitespaces),
                code: code,
                deviceId: auth.deviceId
            )
            if r.isNewUser, let token = r.verifyToken {
                step = .profile(verifyToken: token)
            } else if let t = r.tokens {
                // Существующий юзер — вход
                auth.setAuth(user: t.user, accessToken: t.accessToken, privateKey: nil)
            } else {
                errorMessage = "Неожиданный ответ сервера"
            }
        } catch {
            errorMessage = friendlyError(error) ?? "Неверный код"
        }
    }

    @MainActor
    private func completeProfile() async {
        guard case .profile(let token) = step else { return }
        errorMessage = nil
        loading = true
        defer { loading = false }
        do {
            let (r, privKey) = try await AuthService.phoneCompleteProfile(
                verifyToken: token,
                displayName: displayName.trimmingCharacters(in: .whitespaces),
                username: username.isEmpty ? nil : username,
                deviceId: auth.deviceId
            )
            auth.setAuth(user: r.user, accessToken: r.tokens.accessToken, privateKey: privKey)
        } catch {
            errorMessage = friendlyError(error) ?? "Не удалось завершить регистрацию"
        }
    }

    private func startResendCooldown(_ seconds: Int) {
        resendTimer?.invalidate()
        resendIn = seconds
        resendTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { t in
            Task { @MainActor in
                if resendIn <= 0 { t.invalidate() } else { resendIn -= 1 }
            }
        }
    }

    private func friendlyError(_ error: Error) -> String? {
        if let apiErr = error as? APIError {
            return apiErr.errorDescription
        }
        return error.localizedDescription
    }
}

// MARK: - UI helpers

private struct FieldShell<Content: View>: View {
    let systemImage: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.white.opacity(0.4))
                .frame(width: 18)
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 14).padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
        )
    }
}

private struct BrandSubmit: View {
    let title: String
    let systemIcon: String
    let loading: Bool
    let disabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if loading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.85)
                } else {
                    Text(title)
                    Image(systemName: systemIcon)
                }
            }
            .font(Typo.bodyM.weight(.medium))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(LinearGradient.brand)
                    .shadow(color: Color.brandViolet.opacity(0.55), radius: 16, y: 6)
                    .opacity(disabled ? 0.45 : 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(loading || disabled)
    }
}

#Preview {
    ZStack {
        AmbientBackground()
        PhoneAuthView()
            .padding(20)
            .environmentObject(AuthStore())
    }
    .preferredColorScheme(.dark)
}
