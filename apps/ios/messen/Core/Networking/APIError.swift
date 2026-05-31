import Foundation

enum APIError: LocalizedError {
    case invalidResponse
    case decoding(Error)
    case server(code: String?, message: String, status: Int)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:        return "Некорректный ответ сервера"
        case .decoding(let err):      return "Ошибка разбора ответа: \(err.localizedDescription)"
        case .server(_, let msg, _):  return msg
        case .transport(let err):     return err.localizedDescription
        }
    }
}
