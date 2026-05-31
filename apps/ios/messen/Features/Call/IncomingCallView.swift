import SwiftUI

/// Полноэкранный приём входящего звонка.
struct IncomingCallView: View {
    let info: CallInfo

    private let mgr = CallManager.shared
    @State private var pulse = false

    var body: some View {
        ZStack {
            AmbientBackground()
            LinearGradient(colors: [.black.opacity(0.5), .clear],
                          startPoint: .top, endPoint: .bottom).ignoresSafeArea()

            VStack(spacing: 28) {
                Spacer()

                Text(info.type == .video ? "Видеозвонок" : "Аудиозвонок")
                    .font(Typo.smallM)
                    .foregroundStyle(.white.opacity(0.7))
                    .textCase(.uppercase)
                    .kerning(1.5)

                // Аватар с пульсирующим кольцом
                ZStack {
                    Circle()
                        .stroke(LinearGradient.brand, lineWidth: 4)
                        .frame(width: 220, height: 220)
                        .scaleEffect(pulse ? 1.15 : 1)
                        .opacity(pulse ? 0 : 0.7)
                        .animation(.easeOut(duration: 1.6).repeatForever(autoreverses: false), value: pulse)

                    Circle()
                        .stroke(LinearGradient.brand, lineWidth: 4)
                        .frame(width: 220, height: 220)
                        .scaleEffect(pulse ? 1.3 : 1)
                        .opacity(pulse ? 0 : 0.4)
                        .animation(.easeOut(duration: 1.6).repeatForever(autoreverses: false).delay(0.5), value: pulse)

                    Avatar(url: info.peerAvatar, name: info.peerName, size: 180, withGradientRing: true)
                        .frame(width: 196, height: 196)
                }
                .onAppear { pulse = true }

                Text(info.peerName)
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.4), radius: 8)

                Text("Входящий вызов")
                    .font(Typo.body)
                    .foregroundStyle(.white.opacity(0.65))

                Spacer()

                // Reject + Accept
                HStack(spacing: 80) {
                    Button {
                        mgr.rejectIncoming()
                    } label: {
                        Image(systemName: "phone.down.fill")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 72, height: 72)
                            .background(Color(hex: 0xF43F5E))
                            .clipShape(Circle())
                            .shadow(color: Color(hex: 0xF43F5E).opacity(0.6), radius: 20, x: 0, y: 8)
                    }
                    .buttonStyle(PressDownStyle())

                    Button {
                        mgr.acceptIncoming()
                    } label: {
                        Image(systemName: info.type == .video ? "video.fill" : "phone.fill")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 72, height: 72)
                            .background(LinearGradient.brand)
                            .clipShape(Circle())
                            .shadow(color: Color.brandViolet.opacity(0.6), radius: 20, x: 0, y: 8)
                    }
                    .buttonStyle(PressDownStyle())
                }
                .padding(.bottom, 40)
            }
            .padding(.horizontal, 24)
            .padding(.top, 50)
        }
        .preferredColorScheme(.dark)
    }
}
