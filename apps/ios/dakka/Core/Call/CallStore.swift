import Foundation
import Combine

/// Состояние звонка для UI.
enum CallState: Equatable {
    case idle
    case incoming(CallInfo)   // нам звонят
    case outgoing(CallInfo)   // мы звоним, ждём accept
    case active(CallInfo)     // соединение установлено

    var info: CallInfo? {
        switch self {
        case .idle:                                   return nil
        case .incoming(let i), .outgoing(let i), .active(let i): return i
        }
    }
}

@MainActor
final class CallStore: ObservableObject {
    static let shared = CallStore()

    @Published var state: CallState = .idle

    /// Локальный mute (UI читает, CallManager применяет).
    @Published var isMuted: Bool = false
    @Published var isVideoOff: Bool = false
    @Published var isSpeakerOn: Bool = true

    /// Состояние ICE-соединения для отображения статуса.
    @Published var iceState: String = "—"

    private init() {}
}
