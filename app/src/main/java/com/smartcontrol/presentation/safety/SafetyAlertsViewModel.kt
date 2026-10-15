package com.smartcontrol.presentation.safety

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.domain.safety.SafetyAlert
import com.smartcontrol.domain.safety.SafetyAlertRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class SafetyAlertsViewModel @Inject constructor(
    private val repository: SafetyAlertRepository,
    private val auth: FirebaseAuth
) : ViewModel() {
    private val _alerts = MutableStateFlow<List<SafetyAlert>>(emptyList())
    val alerts: StateFlow<List<SafetyAlert>> = _alerts.asStateFlow()
    private val _status = MutableStateFlow<String?>(null)
    val status: StateFlow<String?> = _status.asStateFlow()
    private val deviceId get() = auth.currentUser?.uid.orEmpty()

    init {
        viewModelScope.launch {
            callbackFlow {
                val listener = FirebaseAuth.AuthStateListener { state ->
                    trySend(state.currentUser?.uid.orEmpty())
                }
                auth.addAuthStateListener(listener)
                trySend(auth.currentUser?.uid.orEmpty())
                awaitClose { auth.removeAuthStateListener(listener) }
            }.distinctUntilChanged()
                .flatMapLatest { uid ->
                    // Clear the previous account's alerts immediately while the next
                    // account's Firestore listener starts.
                    _alerts.value = emptyList()
                    _status.value = null
                    if (uid.isBlank()) {
                        flowOf(emptyList())
                    } else {
                        repository.observe(uid).catch { error ->
                            _status.value = error.message ?: "Could not load safety alerts."
                            emit(emptyList())
                        }
                    }
                }
                .collect { _alerts.value = it }
        }
    }

    fun triggerSos() = createAlert(
        type = "SOS",
        message = "SOS alert triggered by the signed-in device user."
    )

    fun createTestAlert() = createAlert(
        type = "TEST",
        message = "Test safety alert. This is not an emergency."
    )

    private fun createAlert(type: String, message: String) {
        val id = deviceId
        if (id.isBlank()) {
            _status.value = "Sign in before creating a safety alert."
            return
        }
        viewModelScope.launch {
            repository.create(
                SafetyAlert(
                    UUID.randomUUID().toString(),
                    id,
                    type,
                    message,
                    System.currentTimeMillis()
                )
            ).onSuccess {
                _status.value = if (type == "SOS") "SOS alert created successfully." else "Test alert created. No emergency was reported."
            }.onFailure { error ->
                _status.value = error.message ?: "Could not create the safety alert."
            }
        }
    }

    fun acknowledge(alertId: String) {
        viewModelScope.launch {
            repository.acknowledge(alertId)
                .onSuccess { _status.value = "Alert acknowledged." }
                .onFailure { error -> _status.value = error.message ?: "Could not acknowledge this alert." }
        }
    }
}
