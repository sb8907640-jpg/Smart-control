package com.smartcontrol.presentation.media

import android.content.Context
import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.smartcontrol.data.media.WebRtcMediaEngine
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
        signaling.approveSession(id).onFailure { lastError.value = it.message }
        selectedId.value = id
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
        engine.publish(session.sessionId, session.capabilities, projectionIntent)
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
            val policy = featurePolicyRepository.observe().first()
            if (!policy.globalFeaturesEnabled || !policy.globalEnabled) return@runCatching false
            if (policy.featureOverrides[featureId] == false) return@runCatching false
            if (policy.globalFeatureOverrides[featureId] == false) return@runCatching false
            val perUser = policy.perUser[targetDeviceId]
            if (perUser != null &&
                (!perUser.enabled || perUser.featureOverrides[featureId] == false)
            ) return@runCatching false
            true
        }.getOrDefault(false)
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
        engine.view(session.sessionId, sink).onFailure { lastError.value = it.message }
    }

    fun stop(sessionId: String) = viewModelScope.launch {
        engine.stop(sessionId)
        signaling.stopSession(sessionId).onFailure { lastError.value = it.message }
        MediaProjectionForegroundService.stop(context)
        FamilySafetyService.setIdle(context)
        selectedId.value = null
    }

    override fun onCleared() {
        engine.release()
        FamilySafetyService.setIdle(context)
        super.onCleared()
    }
}
