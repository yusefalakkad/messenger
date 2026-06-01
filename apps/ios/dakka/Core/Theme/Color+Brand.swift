import SwiftUI

/// Бренд-палитра — синхронизирована с tailwind.config.js в `packages/web`.
/// Любая правка цвета — править в обоих местах.
extension Color {
    // MARK: Brand accents
    static let brandViolet  = Color(hex: 0x7C4DFF)
    static let brandPink    = Color(hex: 0xFF4D8D)
    static let brandFuchsia = Color(hex: 0xD946EF)
    static let brandOrange  = Color(hex: 0xFF8A3D)

    // MARK: Dark surfaces (глубокий фиолетово-чёрный)
    static let darkBg      = Color(hex: 0x0B0A14)
    static let darkSurface = Color(hex: 0x13111F)
    static let darkCard    = Color(hex: 0x1B1828)
    static let darkBorder  = Color(hex: 0x2A2638)
    static let darkHover   = Color(hex: 0x221F30)
    static let darkInput   = Color(hex: 0x14121E)

    init(hex: UInt32, alpha: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >>  8) & 0xFF) / 255.0
        let b = Double( hex        & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}

