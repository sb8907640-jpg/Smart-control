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

    fun triggerSos() {
        val id = deviceId
        if (id.isBlank()) return
        viewModelScope.launch {
            repository.create(
                SafetyAlert(
                    UUID.randomUUID().toString(),
                    id,
                    "SOS",
                    "SOS alert triggered by the signed-in device user.",
                    System.currentTimeMillis()
                )
            )
        }
    }

    fun acknowledge(alertId: String) {
        viewModelScope.launch { repository.acknowledge(alertId) }
    }
}
