import Foundation

/// Загрузка медиа на бэкенд через multipart/form-data.
/// Эндпоинты `/media/upload/voice|image|video|circle` возвращают
/// `{ url, mimeType, size, duration?, width?, height? }`.
enum MediaService {

    struct UploadedMedia: Decodable {
        let url: String
        let mimeType: String
        let size: Int
        let duration: Double?
        let width: Int?
        let height: Int?
        let waveform: [Double]?
    }

    enum UploadError: LocalizedError {
        case invalidURL
        case transport(Error)
        case server(String)

        var errorDescription: String? {
            switch self {
            case .invalidURL:           return "Некорректный URL для загрузки"
            case .transport(let err):   return err.localizedDescription
            case .server(let msg):      return msg
            }
        }
    }

    /// Загружает голосовое сообщение.
    static func uploadVoice(
        fileURL: URL,
        duration: TimeInterval,
        waveform: [CGFloat]
    ) async throws -> UploadedMedia {
        var fields: [String: String] = [
            "duration": "\(Int(duration.rounded()))",
        ]
        let waveJson = waveform.map { Double($0) }
        if let waveData = try? JSONSerialization.data(withJSONObject: waveJson),
           let waveStr  = String(data: waveData, encoding: .utf8) {
            fields["waveform"] = waveStr
        }
        return try await upload(
            path: "media/upload/voice",
            fileURL: fileURL,
            fileName: "voice.m4a",
            mimeType: "audio/mp4",
            fields: fields
        )
    }

    /// Загружает картинку.
    static func uploadImage(
        fileURL: URL,
        mimeType: String = "image/jpeg",
        fileName: String = "image.jpg"
    ) async throws -> UploadedMedia {
        try await upload(
            path: "media/upload/image",
            fileURL: fileURL,
            fileName: fileName,
            mimeType: mimeType,
            fields: [:]
        )
    }

    /// Загружает полноразмерное видео-сообщение.
    static func uploadVideo(
        fileURL: URL,
        duration: TimeInterval,
        mimeType: String = "video/quicktime",
        fileName: String = "video.mov"
    ) async throws -> UploadedMedia {
        try await upload(
            path: "media/upload/video",
            fileURL: fileURL,
            fileName: fileName,
            mimeType: mimeType,
            fields: ["duration": "\(Int(duration.rounded()))"]
        )
    }

    /// Загружает видео-кружок.
    static func uploadCircle(
        fileURL: URL,
        duration: TimeInterval,
        mimeType: String = "video/mp4"
    ) async throws -> UploadedMedia {
        try await upload(
            path: "media/upload/circle",
            fileURL: fileURL,
            fileName: "circle.mp4",
            mimeType: mimeType,
            fields: ["duration": "\(Int(duration.rounded()))"]
        )
    }

    // MARK: - Core multipart upload

    private static func upload(
        path: String,
        fileURL: URL,
        fileName: String,
        mimeType: String,
        fields: [String: String]
    ) async throws -> UploadedMedia {

        var url = AppConfig.apiBaseURL
        url.append(path: path)

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        if let token = KeychainStore.get(KeychainStore.Keys.accessToken) {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let boundary = "Boundary-\(UUID().uuidString)"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        let body = NSMutableData()

        // Текстовые поля
        for (key, value) in fields {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n")
            body.appendString("\(value)\r\n")
        }

        // Файл
        let fileData = try Data(contentsOf: fileURL)
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n")
        body.appendString("Content-Type: \(mimeType)\r\n\r\n")
        body.append(fileData)
        body.appendString("\r\n")
        body.appendString("--\(boundary)--\r\n")

        let session = URLSession.shared
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.upload(for: req, from: body as Data)
        } catch {
            throw UploadError.transport(error)
        }

        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            let msg = String(data: data, encoding: .utf8) ?? "HTTP error"
            throw UploadError.server(msg)
        }

        let decoder = JSONDecoder()
        struct Envelope: Decodable {
            let success: Bool
            let data: UploadedMedia?
            let error: APIErrorPayload?
        }
        let env = try decoder.decode(Envelope.self, from: data)
        if let media = env.data { return media }
        throw UploadError.server(env.error?.message ?? "Не удалось загрузить медиа")
    }
}

private extension NSMutableData {
    func appendString(_ s: String) {
        if let d = s.data(using: .utf8) { append(d) }
    }
}
