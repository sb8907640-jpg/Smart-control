package com.smartcontrol.presentation.pairing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.domain.pairing.PairingCode
import com.smartcontrol.domain.pairing.PairingRepository
import com.smartcontrol.domain.pairing.PairedDevice
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class PairingUiState(
    val code: PairingCode? = null,
    val busy: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class PairingViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val repository: PairingRepository
) : ViewModel() {
    // Re-subscribe pairing listeners after sign-out/account changes. ViewModels are
    // activity-scoped, so a one-time currentUser lookup can otherwise retain old links.
    private val authUid = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { state ->
            trySend(state.currentUser?.uid)
        }
        auth.addAuthStateListener(listener)
        trySend(auth.currentUser?.uid)
        awaitClose { auth.removeAuthStateListener(listener) }
    }.distinctUntilChanged()

    val localPairing = authUid.flatMapLatest { uid ->
        if (uid.isNullOrBlank()) flowOf(null)
        else repository.observePairing()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val controlledDevices = authUid.flatMapLatest { uid ->
        if (uid.isNullOrBlank()) flowOf(emptyList())
        else repository.observeControlledDevices()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    // Compatibility summary for consumers that need a single representative link.
    val pairing = combine(localPairing, controlledDevices) { local, controlled ->
        local ?: controlled.firstOrNull()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    private val _state = MutableStateFlow(PairingUiState())
    val state = _state.asStateFlow()

    fun generateCode(senderRole: String = "Other", receiverRole: String = "Other") = viewModelScope.launch {
        _state.value = _state.value.copy(busy = true, error = null)
        repository.createPairingCode(senderRole, receiverRole).onSuccess {
            _state.value = PairingUiState(code = it)
        }.onFailure {
            _state.value = PairingUiState(error = it.message ?: "Unable to create pairing code")
        }
    }

    fun claimCode(token: String) = viewModelScope.launch {
        _state.value = _state.value.copy(busy = true, error = null)
        repository.claimPairingCode(token.trim()).onSuccess {
            _state.value = PairingUiState()
        }.onFailure {
            _state.value = _state.value.copy(busy = false, error = it.message ?: "Unable to pair device")
        }
    }

    fun unpair(deviceUid: String? = null) = viewModelScope.launch {
        repository.unpair(deviceUid).onFailure {
            _state.value = _state.value.copy(error = it.message ?: "Unable to unpair device")
        }
    }
}
