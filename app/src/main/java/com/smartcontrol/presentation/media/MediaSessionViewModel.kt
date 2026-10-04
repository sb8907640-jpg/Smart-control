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
    private val engine: WebRtcMediaEngine,
    @ApplicationContext private val context: Context
) : ViewModel() {
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
        val device = controlledDevice.value ?: run {
            lastError.value = "Pair a client device first."
            return@launch
        }
        signaling.createSession(UUID.randomUUID().toString(), device.deviceUid, capabilities)
            .onSuccess { selectedId.value = it.sessionId }
            .onFailure { lastError.value = it.message }
    }

    fun select(id: String) {
        selectedId.value = id
    }

    fun approve(id: String) = viewModelScope.launch {
        signaling.approveSession(id).onFailure { lastError.value = it.message }
        selectedId.value = id
    }

    fun deny(id: String) = viewModelScope.launch {
        signaling.denySession(id).onFailure { lastError.value = it.message }
    }

    fun startPublishing(session: MediaSession, projectionIntent: Intent?) = viewModelScope.launch {
        if (MediaCapability.SCREEN_SHARING in session.capabilities) {
            MediaProjectionForegroundService.start(context)
        }

        engine.publish(session.sessionId, session.capabilities, projectionIntent)
            .onSuccess {
                FamilySafetyService.setSyncing(context)
            }
            .onFailure {
                MediaProjectionForegroundService.stop(context)
                FamilySafetyService.setIdle(context)
                lastError.value = it.message
            }
    }

    fun eglBase() = engine.eglBase()

    fun connectViewer(session: MediaSession, sink: VideoSink?) = viewModelScope.launch {
        engine.view(session.sessionId, sink).onFailure { lastError.value = it.message }
    }

    fun stop(sessionId: String) = viewModelScope.launch {
        engine.stop(sessionId)
        MediaProjectionForegroundService.stop(context)
        FamilySafetyService.setIdle(context)
    }

    override fun onCleared() {
        engine.release()
        FamilySafetyService.setIdle(context)
        super.onCleared()
    }
}
