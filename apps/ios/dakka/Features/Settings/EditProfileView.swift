import SwiftUI
import PhotosUI

@MainActor
struct EditProfileView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @State private var displayName: String = ""
    @State private var avatarItem: PhotosPickerItem?
    @State private var newAvatarURL: String?
    @State private var saving = false
    @State private var error: String?

    /// Снимок auth.user.* на момент открытия экрана — позволяет canSave
    /// сравнить без обращения к @MainActor-isolated auth извне body.
    @State private var initialDisplayName: String = ""
    @State private var currentAvatar: String?

    var body: some View {
        ZStack {
            Color.darkBg.opacity(0.7).ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    closeBar
                    avatarSection
                    BrandTextField(
                        title: "Имя",
                        text: $displayName,
                        placeholder: "Иван",
                        autocapitalization: .words,
                        textContentType: .name
                    )
                    .padding(.horizontal, 16)

                    if let error {
                        Text(error)
                            .font(Typo.small)
                            .foregroundStyle(Color(hex: 0xFCA5A5))
                            .padding(.horizontal, 16)
                    }

                    BrandButton(
                        action: save,
                        isLoading: saving,
                        isDisabled: !canSave
                    ) {
                        Text("Сохранить")
                    }
                    .padding(.horizontal, 16)

                    Spacer(minLength: 40)
                }
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            initialDisplayName = auth.user?.displayName ?? ""
            currentAvatar = auth.user?.avatar
            displayName = initialDisplayName
        }
    }

    private var canSave: Bool {
        let trimmed = displayName.trimmingCharacters(in: .whitespaces)
        return !trimmed.isEmpty && trimmed != initialDisplayName || newAvatarURL != nil
    }

    private var closeBar: some View {
        HStack {
            Text("Профиль")
                .font(Typo.titleM)
                .foregroundStyle(.white)
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())
            }
            .buttonStyle(PressDownStyle())
        }
        .padding(.horizontal, 16).padding(.top, 16)
    }

    private var avatarSection: some View {
        VStack(spacing: 8) {
            PhotosPicker(
                selection: $avatarItem,
                matching: .images,
                photoLibrary: .shared()
            ) {
                ZStack(alignment: .bottomTrailing) {
                    Avatar(
                        url: newAvatarURL ?? currentAvatar,
                        name: initialDisplayName.isEmpty ? "?" : initialDisplayName,
                        size: 110,
                        withGradientRing: true
                    )
                    .frame(width: 116, height: 116)

                    Circle()
                        .fill(LinearGradient.brand)
                        .frame(width: 36, height: 36)
                        .overlay(
                            Image(systemName: "camera.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.white)
                        )
                        .shadow(color: Color.brandViolet.opacity(0.5), radius: 8)
                }
            }
            .onChange(of: avatarItem) { newValue in
                guard let newValue else { return }
                Task { @MainActor in
                    if let prepared = try? await ImagePreparer.prepare(newValue) {
                        await uploadAvatar(prepared: prepared)
                    }
                    avatarItem = nil
                }
            }

            Text("Сменить фото")
                .font(Typo.small)
                .foregroundStyle(.white.opacity(0.45))
        }
    }

    @MainActor
    private func uploadAvatar(prepared: ImagePreparer.Prepared) async {
        saving = true; defer { saving = false }
        do {
            // POST /users/me/avatar — multipart с полем file
            var url = AppConfig.apiBaseURL
            url.append(path: "users/me/avatar")
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            if let token = KeychainStore.get(KeychainStore.Keys.accessToken) {
                req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            let boundary = "Boundary-\(UUID().uuidString)"
            req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

            let body = NSMutableData()
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"file\"; filename=\"avatar.jpg\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(prepared.mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(try Data(contentsOf: prepared.fileURL))
            body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

            let (data, resp) = try await URLSession.shared.upload(for: req, from: body as Data)
            guard let http = resp as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
                throw URLError(.badServerResponse)
            }
            struct AvatarResp: Decodable { let url: String }
            struct Envelope: Decodable { let data: AvatarResp? }
            if let url = try? JSONDecoder().decode(Envelope.self, from: data).data?.url {
                self.newAvatarURL = url
            }
            try? FileManager.default.removeItem(at: prepared.fileURL)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() {
        Task { @MainActor in
            saving = true; defer { saving = false }
            do {
                struct Body: Codable {
                    let displayName: String?
                    let avatar: String?
                }
                struct UserResp: Decodable {
                    let id: String
                    let username: String
                    let displayName: String
                    let avatar: String?
                    let status: String?
                    let publicKey: String?
                }
                let updated: UserResp = try await APIClient.shared.post(
                    "users/me",
                    body: Body(
                        displayName: displayName.trimmingCharacters(in: .whitespaces),
                        avatar: newAvatarURL
                    )
                )
                // Обновляем локального юзера
                if let token = auth.accessToken {
                    auth.setAuth(
                        user: User(
                            id: updated.id,
                            username: updated.username,
                            displayName: updated.displayName,
                            avatar: updated.avatar,
                            status: updated.status,
                            publicKey: updated.publicKey
                        ),
                        accessToken: token
                    )
                }
                dismiss()
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
    }
}
