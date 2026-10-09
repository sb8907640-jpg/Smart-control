package com.smartcontrol.presentation.pairing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
    val pairing = combine(
        repository.observePairing(),
        repository.observeControlledDevice()
    ) { localPairing, controlledDevice -> localPairing ?: controlledDevice }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    private val _state = MutableStateFlow(PairingUiState())
    val state = _state.asStateFlow()

    fun generateCode() = viewModelScope.launch {
        _state.value = _state.value.copy(busy = true, error = null)
        repository.createPairingCode().onSuccess {
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
