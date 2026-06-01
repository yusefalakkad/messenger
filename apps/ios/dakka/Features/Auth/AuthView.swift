import SwiftUI

/// Корневой экран авторизации: логотип, чип-плашка, единый phone+OTP flow.
/// Старые табы Login/Register удалены — мы перешли на phone-auth как в Telegram.
struct AuthView: View {
    @State private var appeared = false

    var body: some View {
        ZStack {
            AmbientBackground()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 28) {
                    Spacer(minLength: 32)
                    header
                    card
                    Spacer(minLength: 32)
                }
                .frame(maxWidth: 420)         // ограничение для iPad/landscape
                .frame(maxWidth: .infinity)   // и центрируем
                .padding(.horizontal, 20)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .preferredColorScheme(.dark)
        .onAppear {
            withAnimation(.spring(response: 0.7, dampingFraction: 0.78)) {
                appeared = true
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 14) {
            // Иконка приложения
            ZStack {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(LinearGradient.brand)
                    .blur(radius: 24).opacity(0.5)
                    .frame(width: 110, height: 110)
                if let uiImg = UIImage(named: "AppIcon") {
                    Image(uiImage: uiImg)
                        .resizable()
                        .frame(width: 96, height: 96)
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .shadow(color: Color.brandViolet.opacity(0.5), radius: 18, y: 10)
                } else {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(LinearGradient.brand)
                        .frame(width: 96, height: 96)
                        .overlay(
                            Image(systemName: "bubble.left.and.bubble.right.fill")
                                .font(.system(size: 42))
                                .foregroundStyle(.white.opacity(0.95))
                        )
                        .shadow(color: Color.brandViolet.opacity(0.5), radius: 18, y: 10)
                }
            }
            .opacity(appeared ? 1 : 0)
            .scaleEffect(appeared ? 1 : 0.6)
            .padding(.bottom, 4)

            Text("dakka")
                .font(.system(size: 52, weight: .heavy, design: .default))
                .foregroundStyle(LinearGradient.brandText)
                .tracking(-1.5)
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 12)

            Text("Общение, которое чувствуешь")
                .font(Typo.body)
                .foregroundStyle(.white.opacity(0.5))
                .opacity(appeared ? 1 : 0)

            BrandChip {
                Image(systemName: "checkmark.shield.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Color.brandViolet)
                Text("E2E-шифрование по умолчанию")
            }
            .opacity(appeared ? 1 : 0)
            .scaleEffect(appeared ? 1 : 0.9)
        }
    }

    // MARK: - Card (tabs + form)

    private var card: some View {
        VStack(spacing: 18) {
            PhoneAuthView()
        }
        .padding(20)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.55), radius: 28, x: 0, y: 18)
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 30)
    }

    private var cardBackground: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.ultraThinMaterial)
            LinearGradient(
                colors: [
                    Color.white.opacity(0.05),
                    Color.white.opacity(0.015)
                ],
                startPoint: .top, endPoint: .bottom
            )
        }
    }

}

#Preview {
    AuthView().environmentObject(AuthStore())
}
