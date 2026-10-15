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

    fun triggerSos() {
        val id = deviceId
        if (id.isBlank()) {
            _status.value = "Sign in before sending an SOS alert."
            return
        }
        viewModelScope.launch {
            repository.create(
                SafetyAlert(
                    UUID.randomUUID().toString(),
                    id,
                    "SOS",
                    "SOS alert triggered by the signed-in device user.",
                    System.currentTimeMillis()
                )
            ).onSuccess {
                _status.value = "SOS alert sent."
            }.onFailure {
                _status.value = it.message ?: "Could not send the SOS alert."
            }
        }
    }

    fun createTestAlert() {
        val id = deviceId
        if (id.isBlank()) {
            _status.value = "Sign in before creating a test alert."
            return
        }
        viewModelScope.launch {
            repository.create(
                SafetyAlert(
                    UUID.randomUUID().toString(),
                    id,
                    "TEST",
                    "This is a test safety alert; no emergency was reported.",
                    System.currentTimeMillis()
                )
            ).onSuccess {
                _status.value = "Test alert created."
            }.onFailure {
                _status.value = it.message ?: "Could not create the test alert."
            }
        }
    }

    fun acknowledge(alertId: String) {
        viewModelScope.launch {
            repository.acknowledge(alertId).onSuccess {
                _status.value = "Alert acknowledged."
            }.onFailure {
                _status.value = it.message ?: "Could not acknowledge this alert."
            }
        }
    }
}
