import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthStore

    @State private var login = ""
    @State private var password = ""
    @State private var error: String?
    @State private var loading = false

    // 2FA-шаг
    @State private var twoFactorToken: String?
    @State private var code = ""

    var body: some View {
        VStack(spacing: 14) {
            if let twoFactorToken {
                twoFactorForm(token: twoFactorToken)
            } else {
                normalForm
            }
        }
    }

    // MARK: - Normal form

    private var normalForm: some View {
        VStack(spacing: 14) {
            BrandTextField(
                title: "Логин, телефон или email",
                text: $login,
                placeholder: "@username",
                textContentType: .username
            )

            BrandTextField(
                title: "Пароль",
                text: $password,
                placeholder: "••••••••",
                isSecure: true,
                textContentType: .password
            )

            if let error {
                errorBanner(error)
            }

            BrandButton(action: handleLogin, isLoading: loading,
                        isDisabled: login.isEmpty || password.count < 1) {
                Text("Войти")
            }
        }
    }

    // MARK: - 2FA form

    private func twoFactorForm(token: String) -> some View {
        VStack(spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.shield.fill")
                    .foregroundStyle(Color.brandViolet)
                Text("Двухфакторная аутентификация")
                    .font(Typo.smallM)
                    .foregroundStyle(Color.brandViolet)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            BrandTextField(
                title: "Код из приложения",
                text: $code,
                placeholder: "123456",
                keyboardType: .numberPad,
                textContentType: .oneTimeCode
            )

            if let error {
                errorBanner(error)
            }

            BrandButton(action: { handleVerify(token: token) }, isLoading: loading,
                        isDisabled: code.count < 6) {
                Text("Подтвердить")
            }

            Button {
                twoFactorToken = nil
                code = ""
                error = nil
            } label: {
                Text("← Назад")
                    .font(Typo.smallM)
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
    }

    private func errorBanner(_ msg: String) -> some View {
        Text(msg)
            .font(Typo.small)
            .foregroundStyle(Color(hex: 0xFCA5A5))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color(hex: 0xF43F5E).opacity(0.1))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: 0xF43F5E).opacity(0.3), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .transition(.opacity.combined(with: .move(edge: .top)))
    }

    // MARK: - Actions

    private func handleLogin() {
        loading = true
        error = nil
        Task {
            defer { loading = false }
            do {
                let resp: LoginResponse = try await AuthService.login(
                    login: login,
                    password: password,
                    deviceId: auth.deviceId
                )
                if resp.twoFactorRequired == true, let token = resp.twoFactorToken {
                    twoFactorToken = token
                    return
                }
                if let user = resp.user, let token = resp.tokens?.accessToken {
                    auth.setAuth(user: user, accessToken: token)
                } else {
                    error = "Сервер вернул неожиданный ответ"
                }
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
    }

    private func handleVerify(token: String) {
        loading = true
        error = nil
        Task {
            defer { loading = false }
            do {
                let resp: LoginResponse = try await AuthService.verify2FA(token: token, code: code)
                if let user = resp.user, let accessToken = resp.tokens?.accessToken {
                    auth.setAuth(user: user, accessToken: accessToken)
                }
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? "Неверный код"
            }
        }
    }
}

#Preview {
    LoginView().environmentObject(AuthStore())
        .padding()
        .background(AmbientBackground())
}
