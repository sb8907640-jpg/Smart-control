package com.smartcontrol.presentation.media

import android.content.Context
import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.FirebaseFunctionsException
import com.smartcontrol.data.media.WebRtcMediaEngine
import com.smartcontrol.domain.media.IceServerConfig
import com.smartcontrol.domain.media.MediaCapability
import com.smartcontrol.domain.media.MediaSession
import com.smartcontrol.domain.media.MediaSignalingRepository
import com.smartcontrol.domain.pairing.PairingRepository
import com.smartcontrol.data.owner.FirestoreFeaturePolicyRepository
import com.smartcontrol.domain.spec.FeatureId
import com.smartcontrol.service.FamilySafetyService
import com.smartcontrol.service.MediaProjectionForegroundService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.webrtc.VideoSink

@HiltViewModel
class MediaSessionViewModel @Inject constructor(
    private val signaling: MediaSignalingRepository,
    pairingRepository: PairingRepository,
    private val featurePolicyRepository: FirestoreFeaturePolicyRepository,
    private val engine: WebRtcMediaEngine,
    @ApplicationContext private val context: Context
) : ViewModel() {
    private val privacyPrefs by lazy { context.getSharedPreferences("privacy_controls", Context.MODE_PRIVATE) }

    val controlledDevice = pairingRepository.observeControlledDevice()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val pending = signaling.observePendingSessionsForDevice()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val selectedId = MutableStateFlow<String?>(null)
    val selectedSession: StateFlow<MediaSession?> = selectedId.flatMapLatest { id ->
        if (id == null) flowOf(null) else signaling.observeSession(id)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val lastError = MutableStateFlow<String?>(null)

    fun request(capabilities: Set<MediaCapability>) = viewModelScope.launch {
        if (!privacyPrefs.getBoolean("allow_session_requests", true) ||
            !privacyPrefs.getBoolean("allow_media_sharing", true)) {
            lastError.value = "Privacy Controls are blocking remote media/session requests."
            return@launch
        }
        val device = controlledDevice.value ?: run {
            lastError.value = "Pair a client device first."
            return@launch
        }
        if (!capabilitiesAllowed(capabilities, device.deviceUid)) {
            lastError.value = "One or more requested capabilities are disabled by the owner for this device."
            return@launch
        }
        signaling.createSession(UUID.randomUUID().toString(), device.deviceUid, capabilities)
            .onSuccess { selectedId.value = it.sessionId }
            .onFailure { lastError.value = it.message }
    }

    fun select(id: String) { selectedId.value = id }

    fun approve(id: String) = viewModelScope.launch {
        val incoming = signaling.observeSession(id).first()
        if (incoming != null && !capabilitiesAllowed(incoming.capabilities, incoming.targetDeviceId)) {
            lastError.value = "This session includes a feature disabled by the owner."
            signaling.denySession(id)
            return@launch
        }
        if (!privacyPrefs.getBoolean("allow_session_requests", true) ||
            !privacyPrefs.getBoolean("allow_media_sharing", true)) {
            lastError.value = "Privacy Controls are blocking remote media/session requests."
            signaling.denySession(id)
            return@launch
        }
        signaling.approveSession(id)
            .onSuccess { selectedId.value = id }
            .onFailure { lastError.value = it.message ?: "The server could not approve this media session." }
    }

    fun deny(id: String) = viewModelScope.launch {
        signaling.denySession(id).onFailure { lastError.value = it.message }
    }

    fun startPublishing(session: MediaSession, projectionIntent: Intent?) = viewModelScope.launch {
        if (!capabilitiesAllowed(session.capabilities, session.targetDeviceId)) {
            lastError.value = "This session includes a feature disabled by the owner."
            signaling.stopSession(session.sessionId)
            return@launch
        }
        if (!privacyPrefs.getBoolean("allow_media_sharing", true)) {
            lastError.value = "Media sharing is disabled in Privacy Controls."
            signaling.stopSession(session.sessionId)
            return@launch
        }
        if (MediaCapability.SCREEN_SHARING in session.capabilities) {
            MediaProjectionForegroundService.start(context)
        }
        engine.publish(session.sessionId, session.capabilities, projectionIntent, resolveIceServers(session.sessionId))
            .onSuccess { FamilySafetyService.setSyncing(context) }
            .onFailure {
                signaling.stopSession(session.sessionId)
                MediaProjectionForegroundService.stop(context)
                FamilySafetyService.setIdle(context)
                lastError.value = it.message
            }
    }

    private suspend fun capabilitiesAllowed(
        capabilities: Set<MediaCapability>,
        targetDeviceId: String
    ): Boolean = capabilities.all { capability ->
        val featureId = when (capability) {
            MediaCapability.CAMERA -> FeatureId.CAMERA
            MediaCapability.MICROPHONE -> FeatureId.MICROPHONE
            MediaCapability.SCREEN_SHARING -> FeatureId.SCREEN_SHARE
        }
        runCatching {
            val policy = featurePolicyRepository.observe(targetDeviceId).first()
            if (!policy.globalFeaturesEnabled || !policy.globalEnabled) return@runCatching false
            if (policy.featureOverrides[featureId] == false) return@runCatching false
            if (policy.globalFeatureOverrides[featureId] == false) return@runCatching false
            val perUser = policy.userPolicy
            if (perUser != null &&
                (!perUser.enabled || !perUser.ownerEnabled ||
                    perUser.expiresAtEpochMs?.let { it <= System.currentTimeMillis() } == true ||
                    perUser.featureOverrides[featureId] == false)
            ) return@runCatching false
            true
        }.getOrDefault(false)
    }

    private suspend fun resolveIceServers(sessionId: String): List<IceServerConfig> {
        val fallback = WebRtcMediaEngine.defaultIceServers()
        return try {
            val payload = FirebaseFunctions.getInstance()
                .getHttpsCallable("getWebRtcIceServers")
                .call(mapOf("sessionId" to sessionId))
                .await()
                .getData() as? Map<*, *> ?: error("ICE server response is invalid")
            val rawServers = payload["iceServers"] as? List<*> ?: emptyList<Any>()
            val configured = rawServers.mapNotNull { raw ->
                val item = raw as? Map<*, *> ?: return@mapNotNull null
                val urls = when (val value = item["urls"]) {
                    is String -> listOf(value)
                    is List<*> -> value.mapNotNull { it as? String }
                    else -> emptyList()
                }
                if (urls.isEmpty()) return@mapNotNull null
                IceServerConfig(
                    urls = urls,
                    username = item["username"] as? String,
                    credential = item["credential"] as? String
                )
            }
            require(configured.isNotEmpty()) { "No ICE servers were returned" }
            if (payload["turnConfigured"] != true) {
                lastError.value = "TURN relay is not configured on the server. Using STUN only; some carrier/NAT networks may not connect."
            } else if (lastError.value?.contains("TURN relay") == true) {
                lastError.value = null
            }
            configured
        } catch (error: FirebaseFunctionsException) {
            // Do not turn an authorization/policy denial into a STUN-only session;
            // that would bypass the server-side approval boundary.
            if (error.code in setOf(
                    FirebaseFunctionsException.Code.PERMISSION_DENIED,
                    FirebaseFunctionsException.Code.FAILED_PRECONDITION,
                    FirebaseFunctionsException.Code.UNAUTHENTICATED,
                    FirebaseFunctionsException.Code.NOT_FOUND,
                    FirebaseFunctionsException.Code.INVALID_ARGUMENT
                )
            ) throw error
            lastError.value = "Secure TURN credentials could not be loaded. Using STUN fallback; some carrier/NAT networks may not connect."
            fallback
        } catch (_: Exception) {
            lastError.value = "Secure TURN credentials could not be loaded. Using STUN fallback; some carrier/NAT networks may not connect."
            fallback
        }
    }

    fun eglBase() = engine.eglBase()

    fun connectViewer(session: MediaSession, sink: VideoSink?) = viewModelScope.launch {
        if (!capabilitiesAllowed(session.capabilities, session.targetDeviceId)) {
            lastError.value = "This session includes a feature disabled by the owner."
            return@launch
        }
        if (!privacyPrefs.getBoolean("allow_media_sharing", true)) {
            lastError.value = "Media sharing is disabled in Privacy Controls."
            return@launch
        }
        engine.view(session.sessionId, sink, resolveIceServers(session.sessionId)).onFailure { lastError.value = it.message }
    }

    fun stop(sessionId: String) = viewModelScope.launch {
        engine.stop(sessionId)
        signaling.stopSession(sessionId).onFailure { lastError.value = it.message }
        MediaProjectionForegroundService.stop(context)
        FamilySafetyService.setIdle(context)
        selectedId.value = null
    }

    fun cleanupStoppedSession(sessionId: String) = viewModelScope.launch {
        // The other peer or the unpair flow may stop a session remotely. Release
        // local capture/peer resources without attempting another status transition.
        engine.stop(sessionId)
        MediaProjectionForegroundService.stop(context)
        FamilySafetyService.setIdle(context)
        if (selectedId.value == sessionId) selectedId.value = null
    }

    override fun onCleared() {
        engine.release()
        FamilySafetyService.setIdle(context)
        super.onCleared()
    }
}
