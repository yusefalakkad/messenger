import SwiftUI
import Combine

/// Поиск по сообщениям в чате.
struct ChatSearchView: View {
    let chatId: String
    let onPickMessage: (Message) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [Message] = []
    @State private var loading = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.dateFormat = "d MMM HH:mm"
        return f
    }()

    private var debounceTimer: Timer? { nil }

    var body: some View {
        ZStack {
            Color.darkBg.opacity(0.7).ignoresSafeArea()

            VStack(spacing: 0) {
                header
                searchField
                content
            }
        }
        .preferredColorScheme(.dark)
        .onAppear { focused = true }
    }

    // MARK: - Pieces

    private var header: some View {
        HStack {
            Text("Поиск в чате")
                .font(Typo.titleM)
                .foregroundStyle(.white)
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 32, height: 32)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())
            }
            .buttonStyle(PressDownStyle())
        }
        .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 12)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.white.opacity(0.4))
            TextField("Поиск по тексту…", text: $query)
                .font(Typo.body).foregroundStyle(.white).tint(.brandViolet)
                .focused($focused)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: query) { _ in
                    debouncedSearch()
                }
            if !query.isEmpty {
                Button { query = ""; results = [] } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.white.opacity(0.35))
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Color.white.opacity(0.04))
        .overlay(Capsule().stroke(Color.white.opacity(0.07), lineWidth: 1))
        .clipShape(Capsule())
        .padding(.horizontal, 16).padding(.bottom, 12)
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView().tint(.brandViolet)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if query.isEmpty {
            EmptyState(
                iconName: "magnifyingglass",
                title: "Поиск по сообщениям",
                subtitle: "E2E-зашифрованные сообщения не индексируются"
            )
        } else if let error {
            Text(error).font(Typo.small).foregroundStyle(Color(hex: 0xFCA5A5))
                .padding()
        } else if results.isEmpty {
            EmptyState(
                iconName: "tray",
                title: "Ничего не найдено",
                subtitle: "Попробуй другие слова"
            )
        } else {
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(results) { msg in
                        row(msg)
                    }
                }
                .padding(.horizontal, 12).padding(.bottom, 24)
            }
        }
    }

    private func row(_ msg: Message) -> some View {
        Button {
            onPickMessage(msg)
            dismiss()
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Avatar(url: msg.sender?.avatar, name: msg.sender?.displayName ?? "?", size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(msg.sender?.displayName ?? "—")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white)
                        Spacer()
                        Text(Self.dateFmt.string(from: msg.createdAt))
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.4))
                    }
                    Text(msg.content ?? "")
                        .font(Typo.small)
                        .foregroundStyle(.white.opacity(0.75))
                        .lineLimit(3)
                }
            }
            .padding(.vertical, 10).padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.white.opacity(0.03))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.white.opacity(0.05), lineWidth: 1))
            )
        }
        .buttonStyle(PressDownStyle())
    }

    // MARK: - Search with debounce

    @State private var searchTask: Task<Void, Never>?

    private func debouncedSearch() {
        searchTask?.cancel()
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { results = []; return }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            if Task.isCancelled { return }
            await runSearch(q)
        }
    }

    private func runSearch(_ q: String) async {
        loading = true; defer { loading = false }
        do {
            results = try await ChatActions.search(chatId: chatId, query: q)
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
