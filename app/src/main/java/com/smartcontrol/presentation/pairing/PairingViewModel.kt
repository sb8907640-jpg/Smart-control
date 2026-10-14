package com.smartcontrol.presentation.pairing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.firestore.FirebaseFirestoreException
import com.smartcontrol.domain.pairing.PairingCode
import com.smartcontrol.domain.pairing.PairingRepository
import com.smartcontrol.domain.pairing.PairedDevice
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.retryWhen
import kotlinx.coroutines.launch

data class PairingUiState(
    val code: PairingCode? = null,
    val busy: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class PairingViewModel @Inject constructor(
    private val repository: PairingRepository
) : ViewModel() {
    // Show the link from either side: this account as a receiver or as a controller.
    // Recreate Firestore listeners after transient network/backend errors. Do not
    // retry permission/auth failures forever; those require a user/configuration fix.
    private fun <T> kotlinx.coroutines.flow.Flow<T>.retryTransiently() = retryWhen { cause, attempt ->
        val code = (cause as? FirebaseFirestoreException)?.code
        val transient = code in setOf(
            FirebaseFirestoreException.Code.UNAVAILABLE,
            FirebaseFirestoreException.Code.DEADLINE_EXCEEDED,
            FirebaseFirestoreException.Code.ABORTED,
            FirebaseFirestoreException.Code.RESOURCE_EXHAUSTED,
            FirebaseFirestoreException.Code.UNKNOWN
        )
        if (transient) {
            delay((1_000L * (1L shl attempt.coerceAtMost(5).toInt())).coerceAtMost(30_000L))
        }
        transient
    }

    val pairing = combine(
        repository.observePairing().retryTransiently(),
        repository.observeControlledDevice().retryTransiently()
    ) { localPairing, controlledDevice -> localPairing ?: controlledDevice }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val controlledDevices = repository.observeControlledDevices().retryTransiently()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
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

    fun unpair() = viewModelScope.launch {
        repository.unpair().onFailure {
            _state.value = _state.value.copy(error = it.message ?: "Unable to unpair device")
        }
    }
}
