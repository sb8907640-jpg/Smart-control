package com.smartcontrol.presentation.audit
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.smartcontrol.domain.audit.AuditRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch

@HiltViewModel
class AuditLogViewModel @Inject constructor(
    private val repository: AuditRepository
) : ViewModel() {
    var events by mutableStateOf(emptyList<com.smartcontrol.domain.audit.ConsentAuditEvent>())
        private set

    fun load(deviceId: String) {
        viewModelScope.launch {
            events = repository.list(deviceId, 100)
        }
    }
}

@Composable
fun AuditLogScreen(
    deviceId: String,
    onBack: () -> Unit,
    viewModel: AuditLogViewModel = androidx.hilt.navigation.compose.hiltViewModel()
) {
    LaunchedEffect(deviceId) { viewModel.load(deviceId) }
    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("Consent Audit Log", style = MaterialTheme.typography.headlineSmall)
        Text("Visible record of consent/session actions for this device.")
        Spacer(Modifier.height(12.dp))
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(viewModel.events) { event ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(event.feature)
                        Text(event.action)
                        Text("Time: " + event.createdAtEpochMs)
                        event.sessionId?.let { Text("Session: $it") }
                    }
                }
            }
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
