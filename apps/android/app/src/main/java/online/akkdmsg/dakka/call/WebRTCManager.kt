package online.akkdmsg.dakka.call

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.projection.MediaProjection
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
import org.webrtc.RtpSender
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
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

    // Sender, через который идёт видео — он один на весь звонок, мы лишь меняем
    // его track при переключении камера ↔ экран.
    private var videoSender: RtpSender? = null

    // Скрин-захват: отдельные source + capturer, активны только во время шеринга.
    private var screenCapturer: ScreenCapturerAndroid? = null
    private var screenSource: VideoSource? = null
    private var screenTrack: VideoTrack? = null
    private var screenSurfaceHelper: SurfaceTextureHelper? = null
    /** Сохраняем оригинальный камера-трек, чтобы вернуть его при остановке шеринга. */
    private var cameraTrackBackup: VideoTrack? = null

    val isSharingScreen: Boolean get() = screenTrack != null

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
            videoSender = pc.addTrack(v, listOf(streamId))
            localVideoTrack = v
        }
    }

    // ── Screen share ─────────────────────────────────────────────────────────

    /**
     * Запускает захват экрана через [ScreenCapturerAndroid] и подменяет track
     * у уже существующего video-sender'а. Камера-capturer ставится на паузу,
     * чтобы экономить батарею; оригинальный трек сохраняется для отката.
     *
     * @param mediaProjectionPermissionData Intent с RESULT_OK из
     *   [android.media.projection.MediaProjectionManager.createScreenCaptureIntent].
     */
    fun startScreenShare(mediaProjectionPermissionData: Intent): Boolean {
        if (!isVideo) return false
        val pc = peer ?: return false
        val sender = videoSender ?: return false
        if (screenTrack != null) return true // уже идёт

        // Останавливаем камеру, чтобы не держала питание.
        try { videoCapturer?.stopCapture() } catch (_: Exception) {}

        val callback = object : MediaProjection.Callback() {
            override fun onStop() {
                // Пользователь остановил из системного UI — снимаем трек.
                stopScreenShare()
            }
        }
        val capturer = ScreenCapturerAndroid(mediaProjectionPermissionData, callback)
        val src = factory.createVideoSource(true /* isScreencast */)
        val helper = SurfaceTextureHelper.create("ScreenCapture", eglBase.eglBaseContext)
        capturer.initialize(helper, context, src.capturerObserver)
        // Разрешение/FPS захвата; реальный поток адаптируется WebRTC.
        capturer.startCapture(1280, 720, 15)

        val track = factory.createVideoTrack("screen0", src)
        track.setEnabled(true)

        // Запоминаем камера-track, чтобы вернуть его.
        cameraTrackBackup = localVideoTrack

        // Заменяем track в существующем sender'e — без renegotiation.
        sender.setTrack(track, /* takeOwnership = */ false)

        screenCapturer = capturer
        screenSource = src
        screenTrack = track
        screenSurfaceHelper = helper
        // localVideoTrack теперь указывает на screen, чтобы превью UI показывало то же,
        // что отправляется удалённой стороне.
        localVideoTrack = track
        return true
    }

    /** Возвращает камеру обратно. Безопасно вызывать повторно. */
    fun stopScreenShare() {
        if (screenTrack == null) return
        val sender = videoSender

        // Возвращаем камеру в sender (если она была).
        val cam = cameraTrackBackup
        if (sender != null && cam != null) {
            sender.setTrack(cam, false)
        }

        // Останавливаем экран.
        try { screenCapturer?.stopCapture() } catch (_: Exception) {}
        screenCapturer?.dispose()
        screenSource?.dispose()
        screenSurfaceHelper?.dispose()
        screenCapturer = null
        screenSource = null
        screenTrack = null
        screenSurfaceHelper = null

        // Перезапускаем камеру.
        if (cam != null) {
            try { videoCapturer?.startCapture(1280, 720, 30) } catch (_: Exception) {}
            localVideoTrack = cam
        }
        cameraTrackBackup = null
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
        // Скрин-захват
        try { screenCapturer?.stopCapture() } catch (_: Exception) {}
        screenCapturer?.dispose()
        screenSource?.dispose()
        screenSurfaceHelper?.dispose()
        screenCapturer = null
        screenSource = null
        screenTrack = null
        screenSurfaceHelper = null
        cameraTrackBackup = null

        try { videoCapturer?.stopCapture() } catch (_: Exception) {}
        videoCapturer?.dispose()
        videoSource?.dispose()
        audioSource?.dispose()
        videoSender = null
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
