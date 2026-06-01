import SwiftUI

struct ChatView: View {
    @EnvironmentObject var auth: AuthStore
    @StateObject private var vm: ChatViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var forwardingMessage: Message?
    @State private var showingCircleRecorder = false
    @State private var showingProfile = false
    @State private var showingSearch = false
    @State private var scrollToMessageId: String?

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
                if let replying = vm.replyingTo {
                    ReplyBar(
                        preview: vm.displayContent(for: replying) ?? replying.content ?? mediaPreview(for: replying),
                        authorName: replying.sender?.displayName ?? "—",
                        onCancel: { vm.cancelReply() }
                    )
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                if let editing = vm.editingMessage {
                    EditBar(
                        preview: vm.displayContent(for: editing) ?? editing.content ?? "",
                        onCancel: { vm.cancelEdit() }
                    )
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                MessageInput(
                    text: $vm.draft,
                    onSend: vm.sendDraft,
                    onTextChanged: vm.onTextChange,
                    onVoiceRecorded: { url, dur, wf in
                        Task { await vm.sendVoice(fileURL: url, duration: dur, waveform: wf) }
                    },
                    onImageSelected: { prepared in
                        Task { await vm.sendImage(prepared: prepared) }
                    },
                    onCircleRequested: { showingCircleRecorder = true }
                )
            }
        }
        .navigationBarHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task { await vm.load() }
        .sheet(item: $forwardingMessage) { msg in
            ForwardSheet(message: msg) { targetChat in
                vm.forward(message: msg, to: targetChat.id)
            }
            .environmentObject(auth)
            .presentationDetents([.large])
            .presentationBackground(.ultraThinMaterial)
        }
        .sheet(isPresented: $showingSearch) {
            ChatSearchView(chatId: vm.chat.id, onPickMessage: { msg in
                scrollToMessageId = msg.id
            })
            .presentationDetents([.large])
            .presentationBackground(.ultraThinMaterial)
        }
        .fullScreenCover(isPresented: $showingCircleRecorder) {
            CircleRecorderView(
                onRecorded: { url, dur in
                    showingCircleRecorder = false
                    Task { await vm.sendCircle(fileURL: url, duration: dur) }
                },
                onCancel: { showingCircleRecorder = false }
            )
        }
        .sheet(isPresented: $showingProfile) {
            ProfilePanel(
                chat: vm.chat,
                currentUserId: auth.user?.id,
                onStartAudioCall: {
                    if let other = vm.otherMember {
                        CallManager.shared.startCall(to: other, in: vm.chat, type: .audio)
                    }
                },
                onStartVideoCall: {
                    if let other = vm.otherMember {
                        CallManager.shared.startCall(to: other, in: vm.chat, type: .video)
                    }
                },
                onChatCleared: {
                    vm.messages.removeAll()
                }
            )
            .presentationDetents([.large])
            .presentationBackground(.ultraThinMaterial)
        }
    }

    // MARK: - Helpers

    private func mediaPreview(for m: Message) -> String {
        switch m.type {
        case .voice:  return "🎤 Голосовое"
        case .image:  return "📷 Фото"
        case .video:  return "🎬 Видео"
        case .circle: return "⭕ Видео-кружок"
        case .file:   return "📎 Файл"
        default:      return ""
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 10) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.04))
                    .clipShape(Circle())
            }
            .buttonStyle(PressDownStyle())

            Button { showingProfile = true } label: {
                HStack(spacing: 10) {
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
                }
            }
            .buttonStyle(PressDownStyle())

            Spacer()

            HStack(spacing: 6) {
                Button { showingSearch = true } label: { headerIcon("magnifyingglass") }
                    .buttonStyle(PressDownStyle())

                // Кнопки звонка — direct-чат, есть другой участник
                if vm.chat.type == .direct, let other = vm.otherMember {
                    Button {
                        CallManager.shared.startCall(to: other, in: vm.chat, type: .audio)
                    } label: { headerIcon("phone.fill") }
                    .buttonStyle(PressDownStyle())

                    Button {
                        CallManager.shared.startCall(to: other, in: vm.chat, type: .video)
                    } label: { headerIcon("video.fill") }
                    .buttonStyle(PressDownStyle())
                }
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
            ScrollView {
                LazyVStack(spacing: 8) {
                    MessageBubbleSkeleton(isOwn: false, width: 180)
                    MessageBubbleSkeleton(isOwn: true,  width: 140)
                    MessageBubbleSkeleton(isOwn: false, width: 220)
                    MessageBubbleSkeleton(isOwn: true,  width: 160)
                    MessageBubbleSkeleton(isOwn: false, width: 200)
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
            }
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
                                displayContent: vm.displayContent(for: msg),
                                currentUserId: auth.user?.id,
                                onReact:   { emoji in vm.react(messageId: msg.id, emoji: emoji) },
                                onDelete:  { vm.delete(messageId: msg.id) },
                                onReply:   { vm.beginReply(msg) },
                                onEdit:    { vm.beginEdit(msg) },
                                onForward: { forwardingMessage = msg }
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
                .onChange(of: scrollToMessageId) { _, id in
                    guard let id else { return }
                    withAnimation(.easeInOut(duration: 0.4)) {
                        proxy.scrollTo(id, anchor: .center)
                    }
                    scrollToMessageId = nil
                }
            }
        }
    }

    private var emptyMessagesState: some View {
        EmptyState(
            iconName: "bubble.left.and.bubble.right.fill",
            title: "Скажите «привет»",
            subtitle: vm.isE2E
                ? "Сообщения защищены сквозным шифрованием"
                : nil
        )
    }
}
