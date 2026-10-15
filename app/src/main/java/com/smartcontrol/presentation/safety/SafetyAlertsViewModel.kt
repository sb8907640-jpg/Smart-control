package com.smartcontrol.presentation.safety

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.domain.pairing.PairingRepository
import com.smartcontrol.domain.safety.SafetyAlert
import com.smartcontrol.domain.safety.SafetyAlertRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
@HiltViewModel
class SafetyAlertsViewModel @Inject constructor(
    private val repository: SafetyAlertRepository,
    private val auth: FirebaseAuth,
    pairingRepository: PairingRepository
) : ViewModel() {
    private val _alerts = MutableStateFlow<List<SafetyAlert>>(emptyList())
    val alerts: StateFlow<List<SafetyAlert>> = _alerts.asStateFlow()
    private val deviceId get() = auth.currentUser?.uid.orEmpty()

    init {
        viewModelScope.launch {
            pairingRepository.observeControlledDevices()
                .map { controlled ->
                    (listOf(deviceId) + controlled.map { it.deviceUid })
                        .filter(String::isNotBlank)
                        .distinct()
                }
                .distinctUntilChanged()
                .flatMapLatest { deviceIds ->
                    if (deviceIds.isEmpty()) {
                        flowOf(emptyList())
                    } else {
                        combine(deviceIds.map { id -> repository.observe(id) }) { groups ->
                            groups.toList()
                                .flatten()
                                .distinctBy { it.deviceId to it.alertId }
                                .sortedByDescending { it.createdAtEpochMs }
                                .take(50)
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
        message = "This is a test safety alert. No emergency is being reported."
    )

    private fun createAlert(type: String, message: String) {
        val id = deviceId
        if (id.isBlank()) return
        viewModelScope.launch {
            repository.create(
                SafetyAlert(
                    UUID.randomUUID().toString(),
                    id,
                    type,
                    message,
                    System.currentTimeMillis()
                )
            )
        }
    }

    fun acknowledge(alert: SafetyAlert) {
        viewModelScope.launch {
            repository.acknowledge(alert.deviceId, alert.alertId)
        }
    }
}
