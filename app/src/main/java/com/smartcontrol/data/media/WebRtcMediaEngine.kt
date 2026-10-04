package com.smartcontrol.data.media

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import com.smartcontrol.domain.media.IceCandidateModel
import com.smartcontrol.domain.media.IceServerConfig
import com.smartcontrol.domain.media.MediaCapability
import com.smartcontrol.domain.media.MediaSignalingRepository
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class WebRtcMediaEngine(
    private val context: Context,
    private val signaling: MediaSignalingRepository,
    private val scope: CoroutineScope
) {
    private val initialized = AtomicBoolean(false)
    private val peerConnections = mutableMapOf<String, PeerConnection>()
    private val captures = mutableMapOf<String, List<AutoCloseable>>()
    private val eglBase: EglBase = EglBase.create()
    private lateinit var factory: PeerConnectionFactory

    fun initialize() {
        if (!initialized.compareAndSet(false, true)) return
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions()
        )
        val encoder = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val decoder = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoder)
            .setVideoDecoderFactory(decoder)
            .createPeerConnectionFactory()
    }

    suspend fun publish(
        sessionId: String,
        capabilities: Set<MediaCapability>,
        mediaProjectionData: Intent?,
        iceServers: List<IceServerConfig> = defaultIceServers()
    ): Result<Unit> = runCatching {
        initialize()
        val pc = createPeerConnection(sessionId, iceServers, null)
        val resources = mutableListOf<AutoCloseable>()
        if (MediaCapability.MICROPHONE in capabilities) {
            val audio = factory.createAudioSource(MediaConstraints())
            val track = factory.createAudioTrack("audio-$sessionId", audio)
            track.setEnabled(true)
            pc.addTrack(track, emptyList())
            resources += AutoCloseable { audio.dispose() }
        }
        if (MediaCapability.CAMERA in capabilities) {
            val camera = createCameraTrack(sessionId)
            pc.addTrack(camera.track, emptyList())
            resources += camera
        }
        if (MediaCapability.SCREEN_SHARING in capabilities) {
            require(mediaProjectionData != null) { "Screen sharing requires MediaProjection consent" }
            val screen = createScreenTrack(sessionId, mediaProjectionData)
            pc.addTrack(screen.track, emptyList())
            resources += screen
        }
        captures[sessionId] = resources

        val offer = createOffer(pc)
        pc.setLocalDescriptionAwait(offer)
        signaling.writeOffer(sessionId, offer.description).getOrThrow()
        waitForAnswerAndCandidates(sessionId, pc)
        signaling.markActive(sessionId).getOrThrow()
    }

    suspend fun view(
        sessionId: String,
        remoteVideoSink: org.webrtc.VideoSink? = null,
        iceServers: List<IceServerConfig> = defaultIceServers()
    ): Result<Unit> = runCatching {
        initialize()
        val pc = createPeerConnection(sessionId, iceServers, remoteVideoSink)
        val session = signaling.observeSession(sessionId).filterNotNull().first { !it.offerSdp.isNullOrBlank() }
        val offer = SessionDescription(SessionDescription.Type.OFFER, session.offerSdp!!)
        pc.setRemoteDescriptionAwait(offer)
        val answer = createAnswer(pc)
        pc.setLocalDescriptionAwait(answer)
        signaling.writeAnswer(sessionId, answer.description).getOrThrow()
        collectRemoteCandidates(sessionId, pc)
        signaling.markActive(sessionId).getOrThrow()
    }

    suspend fun stop(sessionId: String) {
        signaling.stopSession(sessionId)
        captures.remove(sessionId)?.forEach { runCatching { it.close() } }
        peerConnections.remove(sessionId)?.close()
    }

    fun release() {
        peerConnections.values.forEach { it.close() }
        peerConnections.clear()
        captures.values.flatten().forEach { runCatching { it.close() } }
        captures.clear()
        if (initialized.get()) {
            factory.dispose()
            eglBase.release()
            initialized.set(false)
        }
    }

    private fun createPeerConnection(
        sessionId: String,
        iceServers: List<IceServerConfig>,
        remoteSink: org.webrtc.VideoSink?
    ): PeerConnection {
        val config = PeerConnection.RTCConfiguration(
            iceServers.map { server ->
                PeerConnection.IceServer.builder(server.urls)
                    .apply {
                        server.username?.let { setUsername(it) }
                        server.credential?.let { setPassword(it) }
                    }
                    .createIceServer()
            }
        )
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        config.continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        val observer = object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                scope.launch {
                    signaling.addLocalIceCandidate(
                        sessionId,
                        IceCandidateModel(candidate.sdp, candidate.sdpMid, candidate.sdpMLineIndex)
                    )
                }
            }
            override fun onTrack(transceiver: RtpTransceiver?) {
                val track = transceiver?.receiver?.track()
                if (track is VideoTrack) remoteSink?.let(track::addSink)
            }
            override fun onAddTrack(receiver: RtpReceiver?, mediaStreams: Array<out MediaStream>?) {
                val track = receiver?.track()
                if (track is VideoTrack) remoteSink?.let(track::addSink)
            }
            override fun onSignalingChange(newState: PeerConnection.SignalingState?) = Unit
            override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState?) = Unit
            override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
            override fun onIceGatheringChange(newState: PeerConnection.IceGatheringState?) = Unit
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
            override fun onAddStream(stream: MediaStream?) = Unit
            override fun onRemoveStream(stream: MediaStream?) = Unit
            override fun onDataChannel(channel: DataChannel?) = Unit
            override fun onRenegotiationNeeded() = Unit
            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) = Unit
            override fun onSelectedCandidatePairChanged(event: PeerConnection.CandidatePairChangeEvent?) = Unit
            override fun onIceConnectionReceivingChange(receiving: Boolean, timestamp: Long) = Unit
        }
        return factory.createPeerConnection(config, observer)
            ?: error("Unable to create PeerConnection")
            .also { peerConnections[sessionId] = it }
    }

    private suspend fun waitForAnswerAndCandidates(sessionId: String, pc: PeerConnection) {
        val session = signaling.observeSession(sessionId).filterNotNull().first { !it.answerSdp.isNullOrBlank() }
        pc.setRemoteDescriptionAwait(SessionDescription(SessionDescription.Type.ANSWER, session.answerSdp!!))
        collectRemoteCandidates(sessionId, pc)
    }

    private suspend fun collectRemoteCandidates(sessionId: String, pc: PeerConnection) {
        signaling.observeRemoteIceCandidates(sessionId).collect { candidate ->
            pc.addIceCandidate(IceCandidate(candidate.sdpMid, candidate.sdpMLineIndex ?: 0, candidate.candidate))
            if (pc.connectionState() == PeerConnection.PeerConnectionState.CONNECTED) return@collect
        }
    }

    private suspend fun createOffer(pc: PeerConnection): SessionDescription =
        suspendCancellableCoroutine { cont ->
            pc.createOffer(object : SdpObserverAdapter() {
                override fun onCreateSuccess(description: SessionDescription?) {
                    if (description != null) cont.resume(description) else cont.resumeWithException(IllegalStateException("Offer was null"))
                }
                override fun onCreateFailure(error: String?) {
                    cont.resumeWithException(IllegalStateException(error ?: "Offer creation failed"))
                }
            }, MediaConstraints())
        }

    private suspend fun createAnswer(pc: PeerConnection): SessionDescription =
        suspendCancellableCoroutine { cont ->
            pc.createAnswer(object : SdpObserverAdapter() {
                override fun onCreateSuccess(description: SessionDescription?) {
                    if (description != null) cont.resume(description) else cont.resumeWithException(IllegalStateException("Answer was null"))
                }
                override fun onCreateFailure(error: String?) {
                    cont.resumeWithException(IllegalStateException(error ?: "Answer creation failed"))
                }
            }, MediaConstraints())
        }

    private fun createCameraTrack(sessionId: String): CapturedVideo {
        val enumerator = Camera2Enumerator(context)
        val device = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
            ?: enumerator.deviceNames.firstOrNull()
            ?: error("No camera available")
        val capturer = enumerator.createCapturer(device, null) ?: error("Unable to open camera")
        val source = factory.createVideoSource(capturer.isScreencast)
        val helper = SurfaceTextureHelper.create("camera-$sessionId", eglBase.eglBaseContext)
        capturer.initialize(helper, context, source.capturerObserver)
        capturer.startCapture(1280, 720, 24)
        val track = factory.createVideoTrack("camera-$sessionId", source)
        return CapturedVideo(track) {
            runCatching { capturer.stopCapture() }
            capturer.dispose()
            helper.dispose()
            source.dispose()
        }
    }

    private fun createScreenTrack(sessionId: String, data: Intent): CapturedVideo {
        val capturer = ScreenCapturerAndroid(data, object : MediaProjection.Callback() {})
        val source = factory.createVideoSource(true)
        val helper = SurfaceTextureHelper.create("screen-$sessionId", eglBase.eglBaseContext)
        capturer.initialize(helper, context, source.capturerObserver)
        capturer.startCapture(1280, 720, 15)
        val track = factory.createVideoTrack("screen-$sessionId", source)
        return CapturedVideo(track) {
            runCatching { capturer.stopCapture() }
            capturer.dispose()
            helper.dispose()
            source.dispose()
        }
    }

    data class CapturedVideo(val track: VideoTrack, private val closer: () -> Unit) : AutoCloseable {
        override fun close() = closer()
    }

    companion object {
        fun defaultIceServers(): List<IceServerConfig> = listOf(
            IceServerConfig(listOf("stun:stun.l.google.com:19302"))
        )
    }
}

private abstract class SdpObserverAdapter : org.webrtc.SdpObserver {
    override fun onSetSuccess() = Unit
    override fun onSetFailure(error: String?) = Unit
    override fun onCreateSuccess(description: SessionDescription?) = Unit
    override fun onCreateFailure(error: String?) = Unit
}

private suspend fun PeerConnection.setLocalDescriptionAwait(description: SessionDescription) {
    suspendCancellableCoroutine<Unit> { cont ->
        setLocalDescription(object : SdpObserverAdapter() {
            override fun onSetSuccess() { cont.resume(Unit) }
            override fun onSetFailure(error: String?) {
                cont.resumeWithException(IllegalStateException(error ?: "setLocalDescription failed"))
            }
        }, description)
    }
}

private suspend fun PeerConnection.setRemoteDescriptionAwait(description: SessionDescription) {
    suspendCancellableCoroutine<Unit> { cont ->
        setRemoteDescription(object : SdpObserverAdapter() {
            override fun onSetSuccess() { cont.resume(Unit) }
            override fun onSetFailure(error: String?) {
                cont.resumeWithException(IllegalStateException(error ?: "setRemoteDescription failed"))
            }
        }, description)
    }
}
