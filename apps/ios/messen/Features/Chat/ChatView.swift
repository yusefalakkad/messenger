import SwiftUI

struct ChatView: View {
    @EnvironmentObject var auth: AuthStore
    @StateObject private var vm: ChatViewModel
    @Environment(\.dismiss) private var dismiss

    init(chat: Chat, currentUserId: String, privateKey: String?) {
        _vm = StateObject(wrappedValue: ChatViewModel(
            chat: chat,
            currentUserId: currentUserId,
            privateKey: privateKey
        ))
    }

    var body: some View {
        ZStack {
            AmbientBackground()

            VStack(spacing: 0) {
                header
                if vm.isE2E { e2eBanner }
                messagesScroll
                MessageInput(
                    text: $vm.draft,
                    onSend: vm.sendDraft,
                    onTextChanged: vm.onTextChange,
                    onVoiceRecorded: { url, dur, wf in
                        Task { await vm.sendVoice(fileURL: url, duration: dur, waveform: wf) }
                    }
                )
            }
        }
        .navigationBarHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task { await vm.load() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.04))
                    .clipShape(Circle())
            }
            .buttonStyle(PressDownStyle())

            Avatar(
                url: vm.chat.displayAvatar(currentUserId: auth.user?.id),
                name: vm.displayName,
                size: 38,
                online: vm.chat.type == .direct ? vm.chat.isOnline(currentUserId: auth.user?.id) : nil
            )

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Text(vm.displayName)
                        .font(Typo.bodyB)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    if vm.isE2E {
                        Image(systemName: "checkmark.shield.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(Color.brandViolet)
                    }
                }
                Text(subtitle)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(subtitleColor)
                    .lineLimit(1)
            }

            Spacer()

            // Заглушки под кнопки звонка (включим в след. сессии WebRTC)
            HStack(spacing: 8) {
                headerIcon("phone.fill")
                headerIcon("video.fill")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            Color.darkSurface.opacity(0.7)
                .background(.ultraThinMaterial)
                .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.05)), alignment: .bottom)
        )
    }

    private func headerIcon(_ system: String) -> some View {
        Image(systemName: system)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white.opacity(0.45))
            .frame(width: 36, height: 36)
            .background(Color.white.opacity(0.04))
            .clipShape(Circle())
    }

    private var subtitle: String {
        if !vm.typingUsers.isEmpty {
            return "печатает…"
        }
        if vm.chat.type == .group {
            return "\(vm.chat.members.count) участников"
        }
        return vm.chat.isOnline(currentUserId: auth.user?.id) ? "в сети" : "не в сети"
    }

    private var subtitleColor: Color {
        if !vm.typingUsers.isEmpty { return Color.brandViolet }
        if vm.chat.isOnline(currentUserId: auth.user?.id) { return Color(hex: 0x34D399) }
        return Color.white.opacity(0.4)
    }

    // MARK: - E2E banner

    private var e2eBanner: some View {
        HStack(spacing: 5) {
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 10))
            Text("Сообщения защищены сквозным шифрованием")
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundStyle(Color.brandViolet.opacity(0.85))
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity)
        .background(Color.brandViolet.opacity(0.08))
        .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.brandViolet.opacity(0.2)), alignment: .bottom)
    }

    // MARK: - Messages

    @ViewBuilder
    private var messagesScroll: some View {
        if vm.loading && vm.messages.isEmpty {
            ProgressView().tint(.brandViolet)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if vm.messages.isEmpty {
            emptyMessagesState
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(Array(vm.messages.enumerated()), id: \.element.id) { idx, msg in
                            let prev = idx > 0 ? vm.messages[idx - 1] : nil
                            let isFirstInGroup = prev?.senderId != msg.senderId
                            MessageBubble(
                                message: msg,
                                isOwn: msg.senderId == auth.user?.id,
                                isFirstInGroup: isFirstInGroup,
                                displayContent: vm.displayContent(for: msg)
                            )
                            .id(msg.id)
                            .transition(.asymmetric(
                                insertion: .move(edge: .bottom).combined(with: .opacity),
                                removal: .opacity
                            ))
                        }
                        Color.clear.frame(height: 4).id("bottom")
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                }
                .onAppear { proxy.scrollTo("bottom", anchor: .bottom) }
                .onChange(of: vm.messages.count) { _, _ in
                    withAnimation(.easeOut(duration: 0.25)) {
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }
            }
        }
    }

    private var emptyMessagesState: some View {
        VStack(spacing: 10) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 28))
                .foregroundStyle(LinearGradient.brand)
            Text("Скажите «привет»")
                .font(Typo.body)
                .foregroundStyle(.white.opacity(0.5))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
