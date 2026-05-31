import SwiftUI

/// Глубокий фиолетово-чёрный фон + парящие градиентные пятна.
/// Использовать как `.background(AmbientBackground())` или как корневой слой.
struct AmbientBackground: View {
    @State private var animate = false

    var body: some View {
        ZStack {
            Color.darkBg.ignoresSafeArea()

            RadialGradient.ambientViolet
                .frame(width: 540, height: 540)
                .offset(x: animate ? -100 : -160, y: animate ? -180 : -240)
                .blur(radius: 60)
                .opacity(0.85)

            RadialGradient.ambientPink
                .frame(width: 520, height: 520)
                .offset(x: animate ? 140 : 100, y: animate ? 280 : 240)
                .blur(radius: 60)
                .opacity(0.75)

            RadialGradient.ambientOrange
                .frame(width: 360, height: 360)
                .offset(x: animate ? 60 : 100, y: animate ? -20 : 20)
                .blur(radius: 50)
                .opacity(0.6)
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeInOut(duration: 14).repeatForever(autoreverses: true)) {
                animate = true
            }
        }
        .drawingGroup() // компонуем как один слой — экономим GPU при анимации
    }
}

#Preview { AmbientBackground() }
