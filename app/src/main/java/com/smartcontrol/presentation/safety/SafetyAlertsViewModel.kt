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
    private val deviceId get() = auth.currentUser?.uid.orEmpty()

    private val authUid = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { state ->
            trySend(state.currentUser?.uid)
        }
        auth.addAuthStateListener(listener)
        trySend(auth.currentUser?.uid)
        awaitClose { auth.removeAuthStateListener(listener) }
    }.distinctUntilChanged()

    init {
        viewModelScope.launch {
            authUid.flatMapLatest { uid ->
                if (uid.isNullOrBlank()) {
                    _alerts.value = emptyList()
                    flowOf(emptyList())
                } else {
                    repository.observe(uid)
                }
            }.collect { _alerts.value = it }
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

    fun createTestAlert() = triggerSos()

    fun acknowledge(alertId: String) {
        viewModelScope.launch { repository.acknowledge(alertId) }
    }
}
