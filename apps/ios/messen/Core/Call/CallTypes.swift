import Foundation

enum CallType: String, Codable {
    case audio
    case video
}

/// Информация про звонок — для UI.
struct CallInfo: Equatable, Identifiable {
    let id: String              // callId
    let chatId: String
    let peerId: String          // userId другого участника
    let peerName: String
    let peerAvatar: String?
    let type: CallType
    let isInitiator: Bool       // мы звоним (true) или нам звонят (false)
    let startedAt: Date
}

/// SDP / ICE сигнал, который ходит между пирами через socket.io.
/// Точная форма совпадает с webrtc-стандартом — на бэк прокидываем как есть.
struct CallSignal: Codable {
    let type: String?           // "offer" | "answer" | "candidate"
    let sdp: String?            // SDP для offer/answer
    // ICE-candidate поля
    let candidate: String?
    let sdpMid: String?
    let sdpMLineIndex: Int32?
}

/// События от сокета.
struct IncomingCallEvent {
    let callId: String
    let chatId: String
    let callerId: String
    let callerName: String
    let callerAvatar: String?
    let callType: CallType
}

struct CallAcceptedEvent {
    let callId: String
    let peerId: String
}

struct CallEndedEvent {
    let callId: String
    let reason: String?
}

struct CallSignalEvent {
    let callId: String
    let signal: CallSignal
}
