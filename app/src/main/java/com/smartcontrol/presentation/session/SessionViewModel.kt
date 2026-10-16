package com.smartcontrol.presentation.session

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.domain.session.RemoteSession
import com.smartcontrol.domain.session.SessionCapability
import com.smartcontrol.domain.session.SessionRepository
import com.smartcontrol.domain.session.SessionRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class SessionViewModel @Inject constructor(
    private val repository: SessionRepository,
    private val auth: FirebaseAuth
) : ViewModel() {
    val pending = repository.pendingRequests.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptyList()
    )
    val active = repository.activeSession.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        null
    )

    fun requestSession(targetDeviceId: String, capabilities: Set<SessionCapability>, reason: String) =
        viewModelScope.launch {
            val uid = auth.currentUser?.uid ?: error("Sign in first.")
            repository.requestSession(
                SessionRequest(
                    sessionId = UUID.randomUUID().toString(),
                    requesterId = uid,
                    targetDeviceId = targetDeviceId,
                    capabilities = capabilities,
                    reason = reason.trim().take(500),
                    createdAtEpochMs = System.currentTimeMillis()
                )
            )
        }

    fun approve(id: String) = viewModelScope.launch { repository.approve(id) }
    fun deny(id: String) = viewModelScope.launch { repository.deny(id) }
}
