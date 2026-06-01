import SwiftUI

/// Карточка профиля собеседника (direct) или участников (группа).
struct ProfilePanel: View {
    let chat: Chat
    let currentUserId: String?
    let onStartAudioCall: () -> Void
    let onStartVideoCall: () -> Void
    let onChatCleared: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isMuted: Bool
    @State private var processingMute = false
    @State private var confirmClear = false
    @State private var confirmLeave = false
    @State private var showRename = false
    @State private var showAddMembers = false
    @State private var renameDraft = ""
    @State private var pendingKick: ChatMember?

    init(chat: Chat, currentUserId: String?, onStartAudioCall: @escaping () -> Void,
         onStartVideoCall: @escaping () -> Void, onChatCleared: @escaping () -> Void) {
        self.chat = chat
        self.currentUserId = currentUserId
        self.onStartAudioCall = onStartAudioCall
        self.onStartVideoCall = onStartVideoCall
        self.onChatCleared = onChatCleared
        _isMuted = State(initialValue: chat.isMuted(currentUserId: currentUserId))
    }

    private var otherMember: ChatMember? {
        chat.members.first(where: { $0.userId != currentUserId })
    }

    var body: some View {
        ZStack {
            AmbientBackground()

            ScrollView {
                VStack(spacing: 24) {
                    closeButtonBar
                    hero
                    if chat.type == .direct {
                        directInfo
                    } else {
                        groupInfo
                    }
                    chatActions
                    Spacer(minLength: 40)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Close

    private var closeButtonBar: some View {
        HStack {
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 16).padding(.top, 12)
    }

    // MARK: - Hero

    private var hero: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle().fill(LinearGradient.brand)
                    .frame(width: 160, height: 160)
                    .blur(radius: 30).opacity(0.45)
                Avatar(
                    url: chat.displayAvatar(currentUserId: currentUserId),
                    name: chat.displayName(currentUserId: currentUserId),
                    size: 130, withGradientRing: true
                )
                .frame(width: 140, height: 140)
            }

            VStack(spacing: 4) {
                Text(chat.displayName(currentUserId: currentUserId))
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(.white)
                if chat.type == .direct, let other = otherMember {
                    Text("@\(other.user.username)")
                        .font(Typo.body).foregroundStyle(.white.opacity(0.5))
                }
            }

            if chat.type == .direct, let other = otherMember {
                Text(other.user.status == "online" ? "в сети" : "не в сети")
                    .font(Typo.small)
                    .foregroundStyle(other.user.status == "online" ? Color(hex: 0x34D399) : Color.white.opacity(0.45))
            }

            if isE2EReady {
                BrandChip {
                    Image(systemName: "checkmark.shield.fill").font(.system(size: 11))
                        .foregroundStyle(Color.brandViolet)
                    Text("Сквозное шифрование")
                }
            }
        }
    }

    private var isE2EReady: Bool {
        chat.type == .direct &&
        chat.members.allSatisfy { ($0.user.publicKey ?? "").isEmpty == false }
    }

    // MARK: - Direct info + actions

    private var directInfo: some View {
        VStack(spacing: 14) {
            HStack(spacing: 14) {
                actionButton(icon: "phone.fill", label: "Аудио") {
                    dismiss()
                    onStartAudioCall()
                }
                actionButton(icon: "video.fill", label: "Видео") {
                    dismiss()
                    onStartVideoCall()
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func actionButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(LinearGradient.brand)
                    .clipShape(Circle())
                    .shadow(color: Color.brandViolet.opacity(0.5), radius: 14, x: 0, y: 6)
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.85))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.white.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.white.opacity(0.06), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(PressDownStyle())
    }

    // MARK: - Chat actions (mute / clear)

    private var chatActions: some View {
        VStack(spacing: 8) {
            Toggle(isOn: $isMuted) {
                HStack(spacing: 10) {
                    Image(systemName: isMuted ? "bell.slash.fill" : "bell.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.brandViolet)
                        .frame(width: 28, height: 28)
                        .background(Color.brandViolet.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Заглушить уведомления")
                            .font(Typo.body)
                            .foregroundStyle(.white.opacity(0.95))
                        if isMuted {
                            Text("Push не приходят")
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.45))
                        }
                    }
                }
            }
            .tint(.brandViolet)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(Color.white.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.05), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .onChange(of: isMuted) { _, newValue in toggleMute(newValue) }

            Button(role: .destructive) { confirmClear = true } label: {
                HStack(spacing: 10) {
                    Image(systemName: "trash.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color(hex: 0xFCA5A5))
                        .frame(width: 28, height: 28)
                        .background(Color(hex: 0xF43F5E).opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    Text("Очистить историю")
                        .font(Typo.body)
                        .foregroundStyle(Color(hex: 0xFCA5A5))
                    Spacer()
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Color(hex: 0xF43F5E).opacity(0.08))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: 0xF43F5E).opacity(0.2), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(PressDownStyle())
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .alert("Очистить всю историю?", isPresented: $confirmClear) {
            Button("Отмена", role: .cancel) { }
            Button("Очистить", role: .destructive) { clearHistory() }
        } message: {
            Text("Сообщения будут удалены навсегда. Эта операция необратима.")
        }
    }

    private func toggleMute(_ on: Bool) {
        guard !processingMute else { return }
        processingMute = true
        Task {
            defer { processingMute = false }
            // Заглушаем на 100 лет (бессрочно), либо снимаем (nil)
            let until: Date? = on ? Date(timeIntervalSinceNow: 60 * 60 * 24 * 365 * 100) : nil
            do {
                _ = try await ChatActions.setMute(chatId: chat.id, mutedUntil: until)
            } catch {
                // Откатываем тогл при ошибке
                isMuted.toggle()
            }
        }
    }

    private func clearHistory() {
        Task {
            do {
                if try await ChatActions.clearMessages(chatId: chat.id) {
                    onChatCleared()
                    dismiss()
                }
            } catch { /* TODO: error toast */ }
        }
    }

    // MARK: - Group permissions

    private var myRole: String? {
        chat.members.first(where: { $0.userId == currentUserId })?.role
    }
    private var canManage: Bool {
        let r = myRole ?? "member"
        return r == "owner" || r == "admin"
    }

    // MARK: - Group info

    private var groupInfo: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("\(chat.members.count) участн.")
                    .font(Typo.smallM)
                    .foregroundStyle(.white.opacity(0.5))
                    .textCase(.uppercase)
                    .kerning(1)
                Spacer()
                if canManage {
                    HStack(spacing: 6) {
                        Button {
                            renameDraft = chat.name ?? ""
                            showRename = true
                        } label: {
                            Image(systemName: "pencil")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Color.brandViolet)
                                .frame(width: 28, height: 28)
                                .background(Color.brandViolet.opacity(0.15))
                                .clipShape(Circle())
                        }
                        Button {
                            showAddMembers = true
                        } label: {
                            Image(systemName: "person.crop.circle.badge.plus")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Color.brandViolet)
                                .frame(width: 28, height: 28)
                                .background(Color.brandViolet.opacity(0.15))
                                .clipShape(Circle())
                        }
                    }
                }
            }
            .padding(.horizontal, 20)

            VStack(spacing: 6) {
                ForEach(chat.members, id: \.userId) { member in
                    memberRow(member)
                }
            }
            .padding(.horizontal, 16)

            // Leave group — кнопка для всех (owner с одним участником не может)
            Button(role: .destructive) { confirmLeave = true } label: {
                HStack(spacing: 10) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color(hex: 0xFCA5A5))
                        .frame(width: 28, height: 28)
                        .background(Color(hex: 0xF43F5E).opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    Text("Покинуть группу")
                        .font(Typo.body)
                        .foregroundStyle(Color(hex: 0xFCA5A5))
                    Spacer()
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Color(hex: 0xF43F5E).opacity(0.08))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: 0xF43F5E).opacity(0.2), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(PressDownStyle())
            .padding(.horizontal, 20).padding(.top, 4)
        }
        .alert("Покинуть группу?", isPresented: $confirmLeave) {
            Button("Отмена", role: .cancel) { }
            Button("Покинуть", role: .destructive) { leaveGroup() }
        } message: {
            Text("Ты больше не будешь видеть сообщения этой группы.")
        }
        .alert("Удалить участника?", isPresented: .constant(pendingKick != nil)) {
            Button("Отмена", role: .cancel) { pendingKick = nil }
            Button("Удалить", role: .destructive) {
                if let kick = pendingKick { kickMember(kick) }
            }
        } message: {
            Text(pendingKick.map { "Убрать \($0.user.displayName) из группы?" } ?? "")
        }
        .sheet(isPresented: $showRename) {
            renameSheet
                .presentationDetents([.height(240)])
                .presentationBackground(.ultraThinMaterial)
        }
        .sheet(isPresented: $showAddMembers) {
            AddMembersToGroupView(chatId: chat.id, existingMembers: chat.members) {
                showAddMembers = false
            }
            .presentationDetents([.large])
            .presentationBackground(.ultraThinMaterial)
        }
    }

    private func memberRow(_ member: ChatMember) -> some View {
        let isMe = member.userId == currentUserId
        let canKick = canManage && !isMe && member.role != "owner"
        return HStack(spacing: 12) {
            Avatar(url: member.user.avatar, name: member.user.displayName, size: 38,
                   online: member.user.status == "online")
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 5) {
                    Text(member.user.displayName)
                        .font(Typo.bodyB)
                        .foregroundStyle(.white)
                    if isMe {
                        Text("(вы)")
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.4))
                    }
                }
                if let role = member.role, role != "member" {
                    Text(role.uppercased())
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Color.brandViolet)
                        .kerning(0.5)
                } else {
                    Text("@\(member.user.username)")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.45))
                }
            }
            Spacer()
            if canKick {
                Button { pendingKick = member } label: {
                    Image(systemName: "minus.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(Color(hex: 0xF87171).opacity(0.8))
                }
                .buttonStyle(PressDownStyle())
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(Color.white.opacity(0.03))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.06), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var renameSheet: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Переименовать группу")
                    .font(Typo.titleM)
                    .foregroundStyle(.white)
                Spacer()
                Button { showRename = false } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.7))
                        .frame(width: 32, height: 32)
                        .background(Color.white.opacity(0.06))
                        .clipShape(Circle())
                }
            }
            BrandTextField(
                title: "Название",
                text: $renameDraft,
                placeholder: "Команда",
                autocapitalization: .sentences
            )
            BrandButton(
                action: {
                    let name = renameDraft.trimmingCharacters(in: .whitespaces)
                    guard !name.isEmpty else { return }
                    Task {
                        do {
                            _ = try await ChatActions.renameGroup(chatId: chat.id, name: name)
                            showRename = false
                        } catch { /* TODO toast */ }
                    }
                },
                isDisabled: renameDraft.trimmingCharacters(in: .whitespaces).isEmpty
                            || renameDraft == chat.name
            ) {
                Text("Сохранить")
            }
            Spacer()
        }
        .padding(20)
    }

    private func leaveGroup() {
        guard let me = currentUserId else { return }
        Task {
            do {
                try await ChatActions.removeGroupMember(chatId: chat.id, userId: me)
                dismiss()
            } catch { /* TODO toast */ }
        }
    }

    private func kickMember(_ member: ChatMember) {
        Task {
            do {
                try await ChatActions.removeGroupMember(chatId: chat.id, userId: member.userId)
            } catch { /* TODO toast */ }
            pendingKick = nil
        }
    }
}

// MARK: - AddMembersToGroupView

struct AddMembersToGroupView: View {
    let chatId: String
    let existingMembers: [ChatMember]
    let onDone: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [User] = []
    @State private var selected: [User] = []
    @State private var loading = false
    @State private var adding = false
    @FocusState private var focused: Bool

    private var existingIds: Set<String> {
        Set(existingMembers.map { $0.userId })
    }

    var body: some View {
        ZStack {
            Color.darkBg.opacity(0.7).ignoresSafeArea()
            VStack(spacing: 0) {
                header
                searchField
                content
                addBar
            }
        }
        .preferredColorScheme(.dark)
        .onAppear { focused = true }
    }

    private var header: some View {
        HStack {
            Text("Добавить участников")
                .font(Typo.titleM).foregroundStyle(.white)
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 32, height: 32)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 12)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.white.opacity(0.4))
            TextField("Поиск пользователей…", text: $query)
                .font(Typo.body).foregroundStyle(.white).tint(.brandViolet)
                .focused($focused)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: query) { _, _ in Task { await search() } }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Color.white.opacity(0.04))
        .overlay(Capsule().stroke(Color.white.opacity(0.07), lineWidth: 1))
        .clipShape(Capsule())
        .padding(.horizontal, 16).padding(.bottom, 12)
    }

    @ViewBuilder
    private var content: some View {
        ScrollView {
            LazyVStack(spacing: 4) {
                ForEach(results) { u in
                    let already = existingIds.contains(u.id)
                    let isSel = selected.contains(where: { $0.id == u.id })
                    Button {
                        guard !already else { return }
                        if isSel { selected.removeAll { $0.id == u.id } }
                        else     { selected.append(u) }
                    } label: {
                        HStack(spacing: 12) {
                            Avatar(url: u.avatar, name: u.displayName, size: 36)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(u.displayName).font(Typo.bodyB).foregroundStyle(.white)
                                Text("@\(u.username)").font(.system(size: 12)).foregroundStyle(.white.opacity(0.45))
                            }
                            Spacer()
                            if already {
                                Text("в группе")
                                    .font(.system(size: 11))
                                    .foregroundStyle(.white.opacity(0.4))
                            } else if isSel {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.brandViolet)
                            } else {
                                Image(systemName: "circle").foregroundStyle(.white.opacity(0.3))
                            }
                        }
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(Color.white.opacity(0.03))
                                .opacity(already ? 0.5 : 1)
                        )
                    }
                    .buttonStyle(PressDownStyle())
                    .disabled(already)
                }
            }
            .padding(.horizontal, 12).padding(.bottom, 12)
        }
    }

    private var addBar: some View {
        BrandButton(
            action: { Task { await add() } },
            isLoading: adding,
            isDisabled: selected.isEmpty
        ) {
            Text("Добавить · \(selected.count)")
        }
        .padding(.horizontal, 16).padding(.bottom, 24)
    }

    private func search() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { results = []; return }
        loading = true; defer { loading = false }
        do {
            results = try await APIClient.shared.get("users/search", query: ["q": q])
        } catch { /* silent */ }
    }

    private func add() async {
        adding = true; defer { adding = false }
        do {
            _ = try await ChatActions.addGroupMembers(chatId: chatId, userIds: selected.map { $0.id })
            onDone()
        } catch { /* TODO toast */ }
    }
}
