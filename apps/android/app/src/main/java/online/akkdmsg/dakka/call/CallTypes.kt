package online.akkdmsg.dakka.call

import kotlinx.serialization.Serializable

enum class CallType { Audio, Video;
    val raw: String get() = if (this == Audio) "audio" else "video"
    companion object {
        fun from(s: String?): CallType = if (s == "video") Video else Audio
    }
}

data class CallInfo(
    val id: String,
    val chatId: String,
    val peerId: String,
    val peerName: String,
    val peerAvatar: String?,
    val type: CallType,
    val isInitiator: Boolean,
    val startedAt: Long,
)

sealed class CallState {
    data object Idle : CallState()
    data class Incoming(val info: CallInfo) : CallState()
    data class Outgoing(val info: CallInfo) : CallState()
    data class Active(val info: CallInfo) : CallState()

    val info: CallInfo? get() = when (this) {
        Idle -> null
        is Incoming -> info
        is Outgoing -> info
        is Active   -> info
    }
}

/** SDP / ICE-сигнал между пирами. Bit-perfect совместимо с iOS/web. */
@Serializable
data class CallSignal(
    val type: String? = null,           // "offer" | "answer" | "candidate"
    val sdp: String? = null,
    val candidate: String? = null,
    val sdpMid: String? = null,
    val sdpMLineIndex: Int? = null,
)

data class IncomingCallEvent(
    val callId: String,
    val chatId: String,
    val callerId: String,
    val callerName: String,
    val callerAvatar: String?,
    val callType: CallType,
)

data class CallAcceptedEvent(val callId: String, val peerId: String)
data class CallEndedEvent(val callId: String, val reason: String?)
data class CallSignalEvent(val callId: String, val signal: CallSignal)
