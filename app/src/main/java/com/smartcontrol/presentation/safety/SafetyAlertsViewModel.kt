package com.smartcontrol.presentation.safety

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.domain.safety.SafetyAlert
import com.smartcontrol.domain.safety.SafetyAlertRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    private val deviceId get() = auth.currentUser?.uid.orEmpty()

    init {
        if (deviceId.isNotBlank()) {
            viewModelScope.launch {
                repository.observe(deviceId).collect { _alerts.value = it }
            }
        }
    }

    private val _status = MutableStateFlow<String?>(null)
    val status: StateFlow<String?> = _status.asStateFlow()

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
