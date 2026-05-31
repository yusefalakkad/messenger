import SwiftUI
import PhotosUI

/// SwiftUI-обёртка над PhotosPicker — выбор одной картинки из библиотеки.
/// Использовать через `.photosPicker(isPresented:selection:)` модификатор
/// (этот файл — место для сопутствующих helpers).

/// Подготавливает выбранное изображение к загрузке:
/// • Декодирует данные
/// • Сжимает в JPEG (~0.8 quality) и сохраняет в tmp-папку
/// • Возвращает локальный URL + mimeType + размеры
enum ImagePreparer {

    struct Prepared {
        let fileURL: URL
        let mimeType: String
        let fileName: String
        let width: Int
        let height: Int
    }

    static func prepare(_ item: PhotosPickerItem) async throws -> Prepared? {
        guard let data = try await item.loadTransferable(type: Data.self) else { return nil }
        return try await prepare(data: data)
    }

    static func prepare(data raw: Data) async throws -> Prepared? {
        // Декодируем чтобы получить размеры и (если HEIC) перекодировать в JPEG
        guard let img = UIImage(data: raw) else { return nil }

        // Подгоняем под максимум 2048 по большей стороне (чтобы не отправлять 12МП фото)
        let maxSide: CGFloat = 2048
        let scale = min(1, maxSide / max(img.size.width, img.size.height))
        let target = CGSize(width: img.size.width * scale, height: img.size.height * scale)

        let resized: UIImage
        if scale < 1 {
            let renderer = UIGraphicsImageRenderer(size: target)
            resized = renderer.image { _ in img.draw(in: CGRect(origin: .zero, size: target)) }
        } else {
            resized = img
        }

        guard let jpeg = resized.jpegData(compressionQuality: 0.85) else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("img-\(UUID().uuidString).jpg")
        try jpeg.write(to: url, options: .atomic)

        return Prepared(
            fileURL: url,
            mimeType: "image/jpeg",
            fileName: "image.jpg",
            width: Int(resized.size.width),
            height: Int(resized.size.height)
        )
    }
}
