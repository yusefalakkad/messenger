package online.akkdmsg.dakka.call

import android.content.Context
import android.media.AudioManager
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

/**
 * Низкоуровневая обёртка над PeerConnection.
 * • Создаёт фабрику, peer, локальные треки (mic + камера)
 * • Прокидывает события (ICE candidate, remote track, connection state)
 * • Не знает про socket — это работа CallManager
 */
class WebRTCManager(
    private val context: Context,
    private val isVideo: Boolean,
    private val iceServers: List<PeerConnection.IceServer>,
    val eglBase: EglBase,
) {

    var onIceCandidate: ((IceCandidate) -> Unit)? = null
    var onRemoteVideoTrack: ((VideoTrack) -> Unit)? = null
    var onConnectionStateChange: ((PeerConnection.IceConnectionState) -> Unit)? = null

    private val factory: PeerConnectionFactory
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val savedAudioMode: Int = audioManager.mode
    private val savedSpeakerOn: Boolean = audioManager.isSpeakerphoneOn

    private var peer: PeerConnection? = null
    private var videoCapturer: CameraVideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var audioSource: AudioSource? = null

    var localVideoTrack: VideoTrack? = null
        private set
    var localAudioTrack: AudioTrack? = null
        private set
    var remoteVideoTrack: VideoTrack? = null
        private set

    init {
        // Initialize PeerConnectionFactory ONCE per process (idempotent — internal flag)
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .setEnableInternalTracer(false)
                .createInitializationOptions()
        )

        val encoder = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val decoder = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoder)
            .setVideoDecoderFactory(decoder)
            .createPeerConnectionFactory()

        configureAudioForCall()
        createPeer()
        addLocalTracks()
    }

    private fun configureAudioForCall() {
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager.isSpeakerphoneOn = true
    }

    fun setSpeaker(on: Boolean) {
        audioManager.isSpeakerphoneOn = on
    }

    private fun createPeer() {
        val cfg = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
            iceTransportsType = PeerConnection.IceTransportsType.ALL
        }
        peer = factory.createPeerConnection(cfg, object : PeerConnection.Observer {
            override fun onSignalingChange(p0: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                onConnectionStateChange?.invoke(state)
            }
            override fun onIceConnectionReceivingChange(p0: Boolean) {}
            override fun onIceGatheringChange(p0: PeerConnection.IceGatheringState?) {}
            override fun onIceCandidate(candidate: IceCandidate) {
                onIceCandidate?.invoke(candidate)
            }
            override fun onIceCandidatesRemoved(p0: Array<out IceCandidate>?) {}
            override fun onAddStream(stream: MediaStream) {
                val v = stream.videoTracks.firstOrNull()
                if (v != null) {
                    remoteVideoTrack = v
                    onRemoteVideoTrack?.invoke(v)
                }
            }
            override fun onRemoveStream(p0: MediaStream?) {}
            override fun onDataChannel(p0: org.webrtc.DataChannel?) {}
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {}
        })
    }

    private fun addLocalTracks() {
        val pc = peer ?: return
        val streamId = "dakka-stream"

        // Audio
        audioSource = factory.createAudioSource(MediaConstraints())
        val audio = factory.createAudioTrack("audio0", audioSource)
        pc.addTrack(audio, listOf(streamId))
        localAudioTrack = audio

        // Video (только для video звонка)
        if (isVideo) {
            val capturer = createCameraCapturer() ?: return
            videoCapturer = capturer
            val src = factory.createVideoSource(false)
            videoSource = src
            val surfaceHelper = SurfaceTextureHelper.create("VideoCapture", eglBase.eglBaseContext)
            capturer.initialize(surfaceHelper, context, src.capturerObserver)
            capturer.startCapture(1280, 720, 30)

            val v = factory.createVideoTrack("video0", src)
            pc.addTrack(v, listOf(streamId))
            localVideoTrack = v
        }
    }

    private fun createCameraCapturer(): CameraVideoCapturer? {
        val enumerator = Camera2Enumerator(context)
        val frontName = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
            ?: enumerator.deviceNames.firstOrNull() ?: return null
        return enumerator.createCapturer(frontName, null)
    }

    // ── SDP offer/answer ─────────────────────────────────────────────────────

    fun createOffer(onResult: (SessionDescription?) -> Unit) {
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", if (isVideo) "true" else "false"))
        }
        peer?.createOffer(object : SimpleSdpObserver() {
            override fun onCreateSuccess(sdp: SessionDescription) {
                peer?.setLocalDescription(SimpleSdpObserver(), sdp)
                onResult(sdp)
            }
            override fun onCreateFailure(reason: String?) = onResult(null)
        }, constraints)
    }

    fun createAnswer(onResult: (SessionDescription?) -> Unit) {
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", if (isVideo) "true" else "false"))
        }
        peer?.createAnswer(object : SimpleSdpObserver() {
            override fun onCreateSuccess(sdp: SessionDescription) {
                peer?.setLocalDescription(SimpleSdpObserver(), sdp)
                onResult(sdp)
            }
            override fun onCreateFailure(reason: String?) = onResult(null)
        }, constraints)
    }

    fun setRemoteDescription(sdp: SessionDescription, onDone: () -> Unit) {
        peer?.setRemoteDescription(object : SimpleSdpObserver() {
            override fun onSetSuccess() = onDone()
            override fun onSetFailure(reason: String?) = onDone()
        }, sdp)
    }

    fun addRemoteCandidate(c: IceCandidate) {
        peer?.addIceCandidate(c)
    }

    // ── Controls ─────────────────────────────────────────────────────────────

    fun setMuted(muted: Boolean) {
        localAudioTrack?.setEnabled(!muted)
    }

    fun setVideoEnabled(enabled: Boolean) {
        localVideoTrack?.setEnabled(enabled)
    }

    fun switchCamera() {
        videoCapturer?.switchCamera(null)
    }

    // ── Teardown ─────────────────────────────────────────────────────────────

    fun close() {
        try { videoCapturer?.stopCapture() } catch (_: Exception) {}
        videoCapturer?.dispose()
        videoSource?.dispose()
        audioSource?.dispose()
        peer?.close()
        peer = null

        // Восстанавливаем audio routing
        audioManager.mode = savedAudioMode
        audioManager.isSpeakerphoneOn = savedSpeakerOn

        factory.dispose()
    }
}

/** Стандартный SdpObserver с пустыми реализациями. */
abstract class SimpleSdpObserver : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(reason: String?) {}
    override fun onSetFailure(reason: String?) {}
}
