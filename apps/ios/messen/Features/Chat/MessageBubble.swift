import SwiftUI

struct MessageBubble: View {
    let message: Message
    let isOwn: Bool
    let isFirstInGroup: Bool
    /// Уже расшифрованный текст (если был зашифрован).
    let displayContent: String?

    private static let timeFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()

    private var isEncryptedFailed: Bool {
        message.encrypted == true && displayContent == nil
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 6) {
            if isOwn { Spacer(minLength: 40) }

            // Аватар у не-своих сообщений (только у первого в группе)
            if !isOwn {
                Group {
                    if isFirstInGroup, let sender = message.sender {
                        Avatar(url: sender.avatar, name: sender.displayName, size: 30)
                    } else {
                        Color.clear.frame(width: 30)
                    }
                }
            }

            bubble

            if !isOwn { Spacer(minLength: 40) }
        }
        .padding(.vertical, 1)
    }

    @ViewBuilder
    private var bubble: some View {
        VStack(alignment: isOwn ? .trailing : .leading, spacing: 4) {
            // Имя отправителя в группах (первое сообщение группы)
            if !isOwn, isFirstInGroup, let name = message.sender?.displayName {
                Text(name)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(LinearGradient.brandText)
                    .padding(.leading, 12)
            }

            HStack(alignment: .bottom, spacing: 6) {
                content
                metadata
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Group {
                    if isOwn {
                        LinearGradient.outBubble
                    } else {
                        LinearGradient.glassCard
                            .background(.ultraThinMaterial)
                    }
                }
            )
            .clipShape(BubbleShape(isOwn: isOwn))
            .overlay(
                BubbleShape(isOwn: isOwn)
                    .stroke(Color.white.opacity(isOwn ? 0 : 0.06), lineWidth: 1)
            )
            .shadow(color: isOwn ? Color.brandViolet.opacity(0.5) : .black.opacity(0.25),
                    radius: isOwn ? 14 : 8, x: 0, y: 6)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch message.type {
        case .voice:
            if let m = message.media {
                VoicePlayerView(media: m, isOwn: isOwn)
            }
        case .image:
            mediaImage
        default:
            textContent
        }
    }

    @ViewBuilder
    private var textContent: some View {
        if isEncryptedFailed {
            HStack(spacing: 6) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 11))
                Text("Не удалось расшифровать")
                    .font(.system(size: 13, weight: .regular).italic())
            }
            .foregroundStyle(.white.opacity(0.45))
        } else if let text = displayContent {
            Text(text)
                .font(Typo.body)
                .foregroundStyle(.white)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        } else if let raw = message.content {
            Text(raw)
                .font(Typo.body)
                .foregroundStyle(.white)
        }
    }

    @ViewBuilder
    private var mediaImage: some View {
        if let urlStr = message.media?.url, let url = URL(string: urlStr) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img):
                    img.resizable().scaledToFit()
                        .frame(maxWidth: 240, maxHeight: 280)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                default:
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.white.opacity(0.06))
                        .frame(width: 200, height: 160)
                        .overlay(ProgressView().tint(.brandViolet))
                }
            }
        }
    }

    private var metadata: some View {
        HStack(spacing: 3) {
            if message.encrypted == true {
                Image(systemName: "lock.fill")
                    .font(.system(size: 8))
                    .foregroundStyle(isOwn ? Color.white.opacity(0.75) : Color.brandViolet.opacity(0.7))
            }
            Text(Self.timeFmt.string(from: message.createdAt))
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.white.opacity(isOwn ? 0.75 : 0.5))
            if isOwn {
                Image(systemName: (message.readBy ?? []).isEmpty ? "checkmark" : "checkmark.circle.fill")
                    .font(.system(size: 9))
                    .foregroundStyle(.white.opacity(0.85))
            }
        }
        .padding(.bottom, 1)
    }
}

/// Скруглённый прямоугольник с одним «обрезанным» углом — традиционный пузырёк.
private struct BubbleShape: Shape {
    let isOwn: Bool

    func path(in rect: CGRect) -> Path {
        let r: CGFloat = 18
        let r2: CGFloat = 6
        let tl = isOwn ? r : r
        let tr = isOwn ? r : r
        let bl = isOwn ? r : r2
        let br = isOwn ? r2 : r

        var p = Path()
        p.move(to: CGPoint(x: rect.minX + tl, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - tr, y: rect.minY))
        p.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY + tr),
                       control: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - br))
        p.addQuadCurve(to: CGPoint(x: rect.maxX - br, y: rect.maxY),
                       control: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX + bl, y: rect.maxY))
        p.addQuadCurve(to: CGPoint(x: rect.minX, y: rect.maxY - bl),
                       control: CGPoint(x: rect.minX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + tl))
        p.addQuadCurve(to: CGPoint(x: rect.minX + tl, y: rect.minY),
                       control: CGPoint(x: rect.minX, y: rect.minY))
        return p
    }
}
