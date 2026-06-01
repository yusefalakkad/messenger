import SwiftUI

struct Avatar: View {
    let url: String?
    let name: String
    var size: CGFloat = 40
    var online: Bool? = nil
    var withGradientRing: Bool = false

    private var initials: String {
        let parts = name.split(separator: " ")
        let firsts = parts.prefix(2).compactMap { $0.first }.map(String.init)
        return firsts.joined().uppercased()
    }

    /// Детерминированный цвет фона из имени — повторяет логику Avatar.tsx
    private var bgColor: Color {
        let palette: [Color] = [
            Color(hex: 0xF43F5E), Color(hex: 0xEC4899), Color(hex: 0xD946EF),
            Color(hex: 0x8B5CF6), Color(hex: 0x6366F1), Color(hex: 0x3B82F6),
            Color(hex: 0x06B6D4), Color(hex: 0x14B8A6), Color(hex: 0x10B981),
            Color(hex: 0x22C55E), Color(hex: 0xEAB308), Color(hex: 0xF97316),
        ]
        var hash: Int = 0
        for c in name.unicodeScalars { hash = (hash &* 31 &+ Int(c.value)) }
        return palette[abs(hash) % palette.count]
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            content
                .frame(width: size, height: size)
                .clipShape(Circle())
                .overlay(
                    Group {
                        if withGradientRing {
                            Circle()
                                .strokeBorder(LinearGradient.brand, lineWidth: 2)
                                .padding(-3)
                        }
                    }
                )

            if let online {
                Circle()
                    .fill(online ? Color(hex: 0x34D399) : Color.white.opacity(0.25))
                    .frame(width: size * 0.28, height: size * 0.28)
                    .overlay(Circle().stroke(Color.darkSurface, lineWidth: 2))
                    .shadow(color: online ? Color(hex: 0x34D399).opacity(0.6) : .clear, radius: 6)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let url, let parsed = URL(string: url) {
            AsyncImage(url: parsed) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: initialsView
                }
            }
        } else {
            initialsView
        }
    }

    private var initialsView: some View {
        ZStack {
            bgColor
            Text(initials)
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(.white)
        }
    }
}

#Preview {
    HStack(spacing: 16) {
        Avatar(url: nil, name: "Иван Петров", size: 56, online: true, withGradientRing: true)
        Avatar(url: nil, name: "Анна Смирнова", size: 40, online: false)
        Avatar(url: nil, name: "Михаил", size: 32)
    }
    .padding()
    .background(Color.darkBg)
}
