import Foundation
import Combine

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []
    @Published var loading: Bool = false
    @Published var error: String?
    @Published var typingUsers: Set<String> = []
    @Published var draft: String = ""

    /// Сообщение, на которое сейчас отвечаем.
    @Published var replyingTo: Message?
    /// Сообщение, которое сейчас редактируется.
    @Published var editingMessage: Message?

    let chat: Chat
    private let currentUserId: String
    private let privateKey: String?

    private var cancellables = Set<AnyCancellable>()
    private var typingTimer: Timer?

    init(chat: Chat, currentUserId: String, privateKey: String?) {
        self.chat = chat
        self.currentUserId = currentUserId
        self.privateKey = privateKey
        subscribeToSocket()
    }

    deinit {
        typingTimer?.invalidate()
    }

    // MARK: - Compute

    /// Чат E2E если личный и у обоих участников есть publicKey.
    var isE2E: Bool {
        guard chat.type == .direct else { return false }
        return chat.members.allSatisfy { $0.user.publicKey != nil && !($0.user.publicKey ?? "").isEmpty }
    }

    var otherMember: ChatMember? {
        chat.members.first(where: { $0.userId != currentUserId })
    }

    var displayName: String {
        chat.displayName(currentUserId: currentUserId)
    }

    // MARK: - Load

    func load() async {
        loading = true
        defer { loading = false }
        do {
            let result: [Message] = try await APIClient.shared.get("chats/\(chat.id)/messages")
            self.messages = result.sorted { $0.createdAt < $1.createdAt }
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: - Decryption helper

    /// Если сообщение зашифровано — возвращает расшифрованный текст или nil.
    /// Если plaintext — просто content.
    func displayContent(for message: Message) -> String? {
        guard let content = message.content else { return nil }
        if message.encrypted != true { return content }

        guard let nonce = message.nonce,
              let myPriv = privateKey
        else { return nil }

        // Для расшифровки берём публичный ключ другого участника
        // (E2E симметрична: ECDH(my_priv, their_pub) == ECDH(their_priv, my_pub)).
        let theirPub: String?
        if let senderId = message.senderId, senderId == currentUserId {
            theirPub = otherMember?.user.publicKey
        } else {
            theirPub = message.sender?.publicKey ?? otherMember?.user.publicKey
        }
        guard let theirPub else { return nil }

        return try? E2E.decryptText(
            ciphertextB64: content,
            nonceB64: nonce,
            senderPublicKeyB64: theirPub,
            recipientPrivateKeyB64: myPriv
        )
    }

    // MARK: - Send

    func sendDraft() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        draft = ""
        stopTypingImmediate()

        // ── Режим редактирования ──
        if let editing = editingMessage {
            sendEdit(messageId: editing.id, newText: text)
            editingMessage = nil
            return
        }

        let replyToId = replyingTo?.id
        replyingTo = nil

        let payload: SendMessagePayload
        if isE2E,
           let myPriv = privateKey,
           let theirPub = otherMember?.user.publicKey,
           let enc = try? E2E.encryptText(text, recipientPublicKeyB64: theirPub, senderPrivateKeyB64: myPriv) {
            payload = SendMessagePayload(
                chatId: chat.id,
                type: MessageType.text.rawValue,
                content: enc.ciphertextB64,
                nonce: enc.nonceB64,
                encrypted: true,
                mediaData: nil,
                replyToId: replyToId,
                forwardedFromId: nil
            )
        } else {
            payload = SendMessagePayload(
                chatId: chat.id,
                type: MessageType.text.rawValue,
                content: text,
                nonce: nil,
                encrypted: false,
                mediaData: nil,
                replyToId: replyToId,
                forwardedFromId: nil
            )
        }
        SocketClient.shared.send(payload)
    }

    // MARK: - Edit

    /// Начать редактировать (вызывается из контекстного меню).
    func beginEdit(_ message: Message) {
        guard message.senderId == currentUserId else { return }
        editingMessage = message
        replyingTo = nil
        // Заполняем draft уже-расшифрованным текстом
        draft = displayContent(for: message) ?? message.content ?? ""
    }

    func cancelEdit() {
        editingMessage = nil
        draft = ""
    }

    private func sendEdit(messageId: String, newText: String) {
        // Если чат E2E — шифруем новое содержимое тем же способом
        if isE2E,
           let myPriv = privateKey,
           let theirPub = otherMember?.user.publicKey,
           let enc = try? E2E.encryptText(newText, recipientPublicKeyB64: theirPub, senderPrivateKeyB64: myPriv) {
            SocketClient.shared.editMessage(
                messageId: messageId, chatId: chat.id,
                content: enc.ciphertextB64, nonce: enc.nonceB64, encrypted: true
            )
        } else {
            SocketClient.shared.editMessage(
                messageId: messageId, chatId: chat.id,
                content: newText, encrypted: false
            )
        }
    }

    // MARK: - Reply

    func beginReply(_ message: Message) {
        replyingTo = message
        editingMessage = nil
    }

    func cancelReply() {
        replyingTo = nil
    }

    // MARK: - Forward

    /// Пересылает сообщение в другой чат через тот же socket.io event.
    func forward(message: Message, to targetChatId: String) {
        let payload = SendMessagePayload(
            chatId: targetChatId,
            type: message.type.rawValue,
            content: nil,         // backend resolves from forwardedFromId
            nonce: nil,
            encrypted: false,
            mediaData: nil,
            replyToId: nil,
            forwardedFromId: message.id
        )
        SocketClient.shared.send(payload)
    }

    // MARK: - Image message

    func sendImage(prepared: ImagePreparer.Prepared) async {
        do {
            let media = try await MediaService.uploadImage(
                fileURL: prepared.fileURL,
                mimeType: prepared.mimeType,
                fileName: prepared.fileName
            )
            let payload = SendMessagePayload(
                chatId: chat.id,
                type: MessageType.image.rawValue,
                content: nil,
                nonce: nil,
                encrypted: false,
                mediaData: MediaPayload(
                    url: media.url,
                    mimeType: media.mimeType,
                    size: media.size,
                    duration: nil,
                    width: media.width ?? prepared.width,
                    height: media.height ?? prepared.height,
                    waveform: nil,
                    thumbnailUrl: nil
                ),
                replyToId: nil
            )
            SocketClient.shared.send(payload)
            try? FileManager.default.removeItem(at: prepared.fileURL)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: - Voice message

    /// Загружает голосовой файл и отправляет сообщение.
    func sendVoice(fileURL: URL, duration: TimeInterval, waveform: [CGFloat]) async {
        do {
            let media = try await MediaService.uploadVoice(
                fileURL: fileURL,
                duration: duration,
                waveform: waveform
            )
            let payload = SendMessagePayload(
                chatId: chat.id,
                type: MessageType.voice.rawValue,
                content: nil,
                nonce: nil,
                encrypted: false,
                mediaData: MediaPayload(
                    url: media.url,
                    mimeType: media.mimeType,
                    size: media.size,
                    duration: duration,
                    width: nil,
                    height: nil,
                    waveform: waveform.map { Double($0) },
                    thumbnailUrl: nil
                ),
                replyToId: nil
            )
            SocketClient.shared.send(payload)
            // Удаляем локальный временный файл
            try? FileManager.default.removeItem(at: fileURL)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: - Reactions / delete

    func react(messageId: String, emoji: String) {
        SocketClient.shared.reactToMessage(messageId: messageId, chatId: chat.id, emoji: emoji)
    }

    func delete(messageId: String) {
        SocketClient.shared.deleteMessageRemote(messageId: messageId, chatId: chat.id)
        // Локально удаляем сразу для отзывчивости (сервер придёт по сокету)
        messages.removeAll { $0.id == messageId }
    }

    // MARK: - Typing indicator

    func onTextChange() {
        SocketClient.shared.setTyping(chatId: chat.id, isTyping: true)
        typingTimer?.invalidate()
        typingTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                SocketClient.shared.setTyping(chatId: self.chat.id, isTyping: false)
            }
        }
    }

    private func stopTypingImmediate() {
        SocketClient.shared.setTyping(chatId: chat.id, isTyping: false)
        typingTimer?.invalidate()
        typingTimer = nil
    }

    // MARK: - Socket subscriptions

    private func subscribeToSocket() {
        SocketClient.shared.messageReceived
            .filter { [weak self] in $0.chatId == self?.chat.id }
            .sink { [weak self] msg in
                guard let self else { return }
                // Не дублируем (на случай оптимистичной локальной вставки)
                guard !self.messages.contains(where: { $0.id == msg.id }) else { return }
                self.messages.append(msg)
                // Если входящее — сразу помечаем прочитанным
                if msg.senderId != self.currentUserId {
                    SocketClient.shared.markRead(messageId: msg.id, chatId: self.chat.id)
                }
            }
            .store(in: &cancellables)

        SocketClient.shared.messageDeleted
            .filter { [weak self] in $0.chatId == self?.chat.id }
            .sink { [weak self] event in
                self?.messages.removeAll { $0.id == event.messageId }
            }
            .store(in: &cancellables)

        SocketClient.shared.typingChanged
            .filter { [weak self] in $0.chatId == self?.chat.id && $0.userId != self?.currentUserId }
            .sink { [weak self] event in
                guard let self else { return }
                if event.isTyping { self.typingUsers.insert(event.userId) }
                else              { self.typingUsers.remove(event.userId) }
            }
            .store(in: &cancellables)

        SocketClient.shared.messageUpdated
            .sink { [weak self] event in
                guard let self,
                      let idx = self.messages.firstIndex(where: { $0.id == event.id }) else { return }
                // Поскольку Message — value type с let, делаем полный re-fetch текущего чата.
                // Это просто и надёжно; для оптимизации можно ввести мутабельные filed-views.
                _ = idx
                Task { await self.load() }
            }
            .store(in: &cancellables)
    }
}
