import SwiftUI

/// Корневой экран авторизации: логотип, чип-плашка, табы Login/Register.
struct AuthView: View {
    enum Mode: String, CaseIterable {
        case login = "Войти"
        case register = "Регистрация"
    }
    @State private var mode: Mode = .login
    @Namespace private var tabAnim

    var body: some View {
        ZStack {
            AmbientBackground()

            ScrollView {
                VStack(spacing: 32) {
                    Spacer(minLength: 24)
                    header
                    card
                    Spacer(minLength: 24)
                }
                .padding(.horizontal, 20)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Header (logo + tagline + chip)

    private var header: some View {
        VStack(spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(LinearGradient.brand)
                    .blur(radius: 18).opacity(0.55)
                    .frame(width: 92, height: 92)
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(LinearGradient.brand)
                    .frame(width: 84, height: 84)
                    .shadow(color: Color.brandViolet.opacity(0.6), radius: 22, x: 0, y: 12)
                    .overlay(
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                            .font(.system(size: 36, weight: .regular))
                            .foregroundStyle(.white.opacity(0.95))
                    )
            }

            Text("Dakka")
                .font(Typo.titleXL)
                .foregroundStyle(LinearGradient.brandText)

            Text("Общение, которое чувствуешь")
                .font(Typo.body)
                .foregroundStyle(.white.opacity(0.45))

            BrandChip {
                Image(systemName: "checkmark.shield.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Color.brandViolet)
                Text("E2E-шифрование по умолчанию")
            }
        }
    }

    // MARK: - Card (tabs + form)

    private var card: some View {
        VStack(spacing: 20) {
            // Tabs
            HStack(spacing: 0) {
                ForEach(Mode.allCases, id: \.self) { m in
                    Button { withAnimation(.spring(response: 0.4, dampingFraction: 0.78)) { mode = m } } label: {
                        ZStack {
                            if mode == m {
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(LinearGradient.brand)
                                    .shadow(color: Color.brandViolet.opacity(0.55), radius: 16, y: 6)
                                    .matchedGeometryEffect(id: "tab", in: tabAnim)
                            }
                            Text(m.rawValue)
                                .font(Typo.bodyM)
                                .foregroundStyle(.white.opacity(mode == m ? 1 : 0.45))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
            .background(Color.white.opacity(0.04))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.white.opacity(0.07), lineWidth: 1)
            )

            // Form
            Group {
                if mode == .login {
                    LoginView()
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .move(edge: .leading)),
                            removal:   .opacity.combined(with: .move(edge: .trailing))
                        ))
                } else {
                    RegisterView()
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .move(edge: .trailing)),
                            removal:   .opacity.combined(with: .move(edge: .leading))
                        ))
                }
            }
            .animation(.easeInOut(duration: 0.25), value: mode)
        }
        .padding(20)
        .glassCard()
    }
}

#Preview {
    AuthView().environmentObject(AuthStore())
}
