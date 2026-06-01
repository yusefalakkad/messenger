import SwiftUI

struct MessageBubble: View {
    let message: Message
    let isOwn: Bool
    let isFirstInGroup: Bool
    /// Уже расшифрованный текст (если был зашифрован).
    let displayContent: String?
    let currentUserId: String?
    let onReact: (String) -> Void
    let onDelete: () -> Void
    let onReply: () -> Void
    let onEdit: () -> Void
    let onForward: () -> Void

    @State private var showReactionPicker = false

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

            VStack(alignment: isOwn ? .trailing : .leading, spacing: 4) {
                bubble
                    .contextMenu {
                        Button(action: onReply) {
                            Label("Ответить", systemImage: "arrowshape.turn.up.left")
                        }
                        Button {
                            if let text = displayContent ?? message.content {
                                SensitiveClipboard.copy(text, expiresIn: 300)
                            }
                        } label: {
                            Label("Скопировать", systemImage: "doc.on.doc")
                        }
                        Button {
                            showReactionPicker = true
                        } label: {
                            Label("Реакция", systemImage: "face.smiling")
                        }
                        Button(action: onForward) {
                            Label("Переслать", systemImage: "arrowshape.turn.up.right")
                        }
                        if isOwn, message.type == .text {
                            Button(action: onEdit) {
                                Label("Редактировать", systemImage: "pencil")
                            }
                        }
                        if isOwn {
                            Button(role: .destructive, action: onDelete) {
                                Label("Удалить", systemImage: "trash")
                            }
                        }
                    }
                if let rs = message.reactions, !rs.isEmpty {
                    ReactionsBar(
                        reactions: rs,
                        currentUserId: currentUserId,
                        onToggle: onReact
                    )
                    .padding(.horizontal, 4)
                }
            }

            if !isOwn { Spacer(minLength: 40) }
        }
        .padding(.vertical, 1)
        .sheet(isPresented: $showReactionPicker) {
            VStack(spacing: 8) {
                Text("Выбери реакцию")
                    .font(Typo.bodyM)
                    .foregroundStyle(.white.opacity(0.6))
                ReactionPicker(
                    onPick: { emoji in
                        onReact(emoji)
                        showReactionPicker = false
                    },
                    onMore: {
                        // На будущее: полный emoji picker
                        showReactionPicker = false
                    }
                )
            }
            .padding(20)
            .presentationDetents([.height(140)])
            .presentationBackground(.ultraThinMaterial)
        }
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

            VStack(alignment: .leading, spacing: 4) {
                if let reply = message.replyTo {
                    replyQuote(reply)
                }
                if message.forwardedFromId != nil {
                    forwardedBadge
                }
                HStack(alignment: .bottom, spacing: 6) {
                    content
                    metadata
                }
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
        case .circle:
            if let m = message.media {
                CirclePlayerView(media: m, isOwn: isOwn)
            }
        case .video:
            if let m = message.media {
                VideoMessage(media: m, isOwn: isOwn)
            }
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

    private func replyQuote(_ reply: ReplyPreview) -> some View {
        HStack(spacing: 8) {
            Rectangle()
                .fill(isOwn ? AnyShapeStyle(Color.white.opacity(0.6)) : AnyShapeStyle(LinearGradient.brand))
                .frame(width: 3)
                .clipShape(Capsule())
            VStack(alignment: .leading, spacing: 1) {
                Text(reply.sender?.displayName ?? "—")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(isOwn ? Color.white.opacity(0.9) : Color.brandViolet)
                Text(reply.content ?? "—")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
        .background(
            (isOwn ? Color.white.opacity(0.12) : Color.brandViolet.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        )
    }

    private var forwardedBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: "arrowshape.turn.up.right.fill")
                .font(.system(size: 9, weight: .semibold))
            Text("Пересланное сообщение")
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundStyle(isOwn ? Color.white.opacity(0.7) : Color.brandViolet.opacity(0.8))
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
