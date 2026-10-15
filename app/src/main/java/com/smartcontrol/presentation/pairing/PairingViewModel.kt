package com.smartcontrol.presentation.pairing

import androidx.lifecycle.ViewModel
import com.google.firebase.auth.FirebaseAuth
import androidx.lifecycle.viewModelScope
import com.smartcontrol.domain.pairing.PairingCode
import com.smartcontrol.domain.pairing.PairingRepository
import com.smartcontrol.domain.pairing.PairedDevice
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class PairingUiState(
    val code: PairingCode? = null,
    val busy: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class PairingViewModel @Inject constructor(
    private val repository: PairingRepository,
    private val auth: FirebaseAuth
) : ViewModel() {
    private val signedInUid = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { state ->
            trySend(state.currentUser?.uid.orEmpty())
        }
        auth.addAuthStateListener(listener)
        trySend(auth.currentUser?.uid.orEmpty())
        awaitClose { auth.removeAuthStateListener(listener) }
    }.distinctUntilChanged().stateIn(
        viewModelScope,
        SharingStarted.Eagerly,
        auth.currentUser?.uid.orEmpty()
    )

    // Recreate Firestore listeners when the authenticated account changes; do not
    // leave a previous account's pairing code or device list visible.
    val pairing = signedInUid.flatMapLatest { uid ->
        if (uid.isBlank()) {
            flowOf(null)
        } else {
            combine(
                repository.observePairing(),
                repository.observeControlledDevice()
            ) { localPairing, controlledDevice -> localPairing ?: controlledDevice }
                .onStart { emit(null) }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val controlledDevices = signedInUid.flatMapLatest { uid ->
        if (uid.isBlank()) flowOf(emptyList<PairedDevice>())
        else repository.observeControlledDevices().onStart { emit(emptyList()) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    private val _state = MutableStateFlow(PairingUiState())
    val state = _state.asStateFlow()
    private var lastObservedUid = auth.currentUser?.uid.orEmpty()

    init {
        viewModelScope.launch {
            signedInUid.collect { uid ->
                if (uid != lastObservedUid) {
                    lastObservedUid = uid
                    _state.value = PairingUiState()
                }
            }
        }
    }

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

    fun unpair() = viewModelScope.launch {
        repository.unpair().onFailure {
            _state.value = _state.value.copy(error = it.message ?: "Unable to unpair device")
        }
    }
}
