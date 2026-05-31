import SwiftUI

struct RegisterView: View {
    @EnvironmentObject var auth: AuthStore

    @State private var username = ""
    @State private var displayName = ""
    @State private var phone = ""
    @State private var password = ""
    @State private var error: String?
    @State private var loading = false

    var body: some View {
        VStack(spacing: 14) {
            HStack(spacing: 10) {
                BrandTextField(
                    title: "Username",
                    text: $username,
                    placeholder: "@username"
                )
                BrandTextField(
                    title: "Имя",
                    text: $displayName,
                    placeholder: "Иван",
                    autocapitalization: .words
                )
            }

            BrandTextField(
                title: "Телефон (необязательно)",
                text: $phone,
                placeholder: "+7 900 000 00 00",
                keyboardType: .phonePad,
                textContentType: .telephoneNumber
            )

            BrandTextField(
                title: "Пароль",
                text: $password,
                placeholder: "Минимум 8 символов",
                isSecure: true,
                textContentType: .newPassword
            )

            // E2E notice
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "checkmark.shield.fill")
                    .foregroundStyle(Color.brandViolet)
                    .padding(.top, 1)
                Text("При регистрации создастся ключ шифрования. Приватный ключ хранится только на устройстве.")
                    .font(Typo.small)
                    .foregroundStyle(.white.opacity(0.7))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.brandViolet.opacity(0.1))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.brandViolet.opacity(0.25), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            if let error {
                Text(error)
                    .font(Typo.small)
                    .foregroundStyle(Color(hex: 0xFCA5A5))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color(hex: 0xF43F5E).opacity(0.1))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: 0xF43F5E).opacity(0.3), lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .transition(.opacity)
            }

            BrandButton(action: handleRegister, isLoading: loading,
                        isDisabled: !canSubmit) {
                Text("Создать аккаунт")
            }
        }
    }

    private var canSubmit: Bool {
        username.count >= 3 && displayName.count >= 1 && password.count >= 8
    }

    private func handleRegister() {
        loading = true
        error = nil
        Task {
            defer { loading = false }
            do {
                let resp = try await AuthService.register(
                    username: username.trimmingCharacters(in: .whitespaces),
                    displayName: displayName.trimmingCharacters(in: .whitespaces),
                    password: password,
                    phone: phone.isEmpty ? nil : phone
                )
                auth.setAuth(user: resp.user, accessToken: resp.tokens.accessToken)
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? "Ошибка регистрации"
            }
        }
    }
}

#Preview {
    RegisterView().environmentObject(AuthStore())
        .padding()
        .background(AmbientBackground())
}
