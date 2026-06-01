package online.akkdmsg.dakka.call

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import online.akkdmsg.dakka.data.ChatMember
import online.akkdmsg.dakka.data.api.ICEServerService
import online.akkdmsg.dakka.data.api.SocketClient
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection
import org.webrtc.SessionDescription
import java.util.UUID

/**
 * Высокоуровневая оркестрация звонков: WebRTC + signaling + state.
 * Singleton, чтобы переживать смену экранов и навигацию.
 */
object CallManager {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var rtc: WebRTCManager? = null
    private var pendingCandidates: MutableList<IceCandidate> = mutableListOf()
    private var hasRemoteDescription = false
    private var cachedIce: List<PeerConnection.IceServer>? = null

    /** Общий EGL-контекст для VideoView'ов — должен совпадать между local/remote. */
    var eglBase: EglBase? = null
        private set

    private var appContext: Context? = null

    /** Вызывается из Application.onCreate (или лениво из первого старта звонка). */
    fun init(ctx: Context) {
        if (appContext != null) return
        appContext = ctx.applicationContext
        wireSocket()
        scope.launch { cachedIce = ICEServerService.fetch() }
    }

    // ── Public API ───────────────────────────────────────────────────────────

    fun startCall(peer: ChatMember, chatId: String, type: CallType) {
        if (CallStore.state.value !is CallState.Idle) return
        val callId = "${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(6)}"
        val info = CallInfo(
            id = callId,
            chatId = chatId,
            peerId = peer.userId,
            peerName = peer.user.displayName,
            peerAvatar = peer.user.avatar,
            type = type,
            isInitiator = true,
            startedAt = System.currentTimeMillis(),
        )
        CallStore.setState(CallState.Outgoing(info))
        SocketClient.initiateCall(callId, peer.userId, chatId, type)
        setupRTC(type == CallType.Video) {
            it.createOffer { sdp ->
                sdp ?: return@createOffer
                SocketClient.sendCallSignal(callId, CallSignal(type = "offer", sdp = sdp.description))
            }
        }
    }

    fun acceptIncoming() {
        val info = (CallStore.state.value as? CallState.Incoming)?.info ?: return
        SocketClient.acceptCall(info.id)
        CallStore.setState(CallState.Active(info))
        setupRTC(info.type == CallType.Video) {
            // Каллер пришлёт offer — мы ответим answer'ом в handleSignal()
        }
    }

    fun rejectIncoming() {
        val info = (CallStore.state.value as? CallState.Incoming)?.info ?: return
        SocketClient.rejectCall(info.id)
        teardown()
    }

    fun endCurrent() {
        CallStore.state.value.info?.let { SocketClient.endCall(it.id) }
        teardown()
    }

    fun toggleMute() {
        val v = !CallStore.isMuted.value
        CallStore.setMuted(v)
        rtc?.setMuted(v)
    }

    fun toggleVideo() {
        val v = !CallStore.isVideoOff.value
        CallStore.setVideoOff(v)
        rtc?.setVideoEnabled(!v)
    }

    fun toggleSpeaker() {
        val v = !CallStore.isSpeakerOn.value
        CallStore.setSpeakerOn(v)
        rtc?.setSpeaker(v)
    }

    fun switchCamera() {
        rtc?.switchCamera()
    }

    val localVideoTrack get() = rtc?.localVideoTrack
    val remoteVideoTrack get() = rtc?.remoteVideoTrack
    val rendererEgl: EglBase? get() = rtc?.eglBase

    // ── Setup ────────────────────────────────────────────────────────────────

    private fun setupRTC(isVideo: Boolean, then: (WebRTCManager) -> Unit) {
        if (rtc != null) { then(rtc!!); return }
        val ctx = appContext ?: return
        val ice = cachedIce ?: listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
        )
        val egl = EglBase.create().also { eglBase = it }
        val m = WebRTCManager(ctx, isVideo, ice, egl).apply {
            onIceCandidate = { c ->
                val info = CallStore.state.value.info ?: return@apply
                SocketClient.sendCallSignal(info.id, CallSignal(
                    type = "candidate",
                    candidate = c.sdp,
                    sdpMid = c.sdpMid,
                    sdpMLineIndex = c.sdpMLineIndex,
                ))
            }
            onConnectionStateChange = { state ->
                if ((state == PeerConnection.IceConnectionState.CONNECTED ||
                     state == PeerConnection.IceConnectionState.COMPLETED) &&
                    CallStore.state.value is CallState.Outgoing) {
                    val info = (CallStore.state.value as CallState.Outgoing).info
                    CallStore.setState(CallState.Active(info))
                }
            }
        }
        rtc = m
        then(m)
    }

    // ── Socket subscription ──────────────────────────────────────────────────

    private fun wireSocket() {
        scope.launch {
            SocketClient.callIncoming.collect { event ->
                if (CallStore.state.value !is CallState.Idle) {
                    SocketClient.rejectCall(event.callId); return@collect
                }
                CallStore.setState(CallState.Incoming(CallInfo(
                    id = event.callId,
                    chatId = event.chatId,
                    peerId = event.callerId,
                    peerName = event.callerName,
                    peerAvatar = event.callerAvatar,
                    type = event.callType,
                    isInitiator = false,
                    startedAt = System.currentTimeMillis(),
                )))
            }
        }
        scope.launch {
            SocketClient.callAccepted.collect { _ -> /* state переключится по ICE connected */ }
        }
        scope.launch {
            SocketClient.callEnded.collect { event ->
                if (CallStore.state.value.info?.id == event.callId) teardown()
            }
        }
        scope.launch {
            SocketClient.callSignal.collect { event ->
                val info = CallStore.state.value.info ?: return@collect
                if (info.id != event.callId) return@collect
                handleSignal(event.signal)
            }
        }
    }

    private fun handleSignal(signal: CallSignal) {
        val rtc = rtc ?: return
        when (signal.type) {
            "offer" -> {
                val sdp = signal.sdp ?: return
                rtc.setRemoteDescription(SessionDescription(SessionDescription.Type.OFFER, sdp)) {
                    hasRemoteDescription = true
                    flushPending()
                    rtc.createAnswer { ans ->
                        ans ?: return@createAnswer
                        val info = CallStore.state.value.info ?: return@createAnswer
                        SocketClient.sendCallSignal(info.id, CallSignal(
                            type = "answer", sdp = ans.description,
                        ))
                    }
                }
            }
            "answer" -> {
                val sdp = signal.sdp ?: return
                rtc.setRemoteDescription(SessionDescription(SessionDescription.Type.ANSWER, sdp)) {
                    hasRemoteDescription = true
                    flushPending()
                }
            }
            "candidate" -> {
                val cand = signal.candidate ?: return
                val ice = IceCandidate(signal.sdpMid ?: "", signal.sdpMLineIndex ?: 0, cand)
                if (hasRemoteDescription) rtc.addRemoteCandidate(ice)
                else pendingCandidates.add(ice)
            }
        }
    }

    private fun flushPending() {
        val rtc = rtc ?: return
        pendingCandidates.forEach(rtc::addRemoteCandidate)
        pendingCandidates.clear()
    }

    private fun teardown() {
        rtc?.close()
        rtc = null
        eglBase?.release()
        eglBase = null
        pendingCandidates.clear()
        hasRemoteDescription = false
        CallStore.reset()
    }
}
