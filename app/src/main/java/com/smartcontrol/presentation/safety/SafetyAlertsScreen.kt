package com.smartcontrol.presentation.safety

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun SafetyAlertsScreen(
    onBack: () -> Unit,
    viewModel: SafetyAlertsViewModel = hiltViewModel()
) {
    val alerts by viewModel.alerts.collectAsState()
    Column(
        Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Safety Alerts", style = MaterialTheme.typography.headlineSmall)
        Text("Alerts are visible to the signed-in device user. No hidden monitoring is used.")
        Button(onClick = viewModel::triggerSos, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) { Text("Trigger SOS") }
        OutlinedButton(onClick = viewModel::createTestAlert) { Text("Create test alert") }
        if (alerts.isEmpty()) Text("No safety alerts.")
        alerts.forEach { alert ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(alert.type)
                    Text(alert.message)
                    if (!alert.acknowledged) {
                        OutlinedButton(onClick = { viewModel.acknowledge(alert.alertId) }) {
                            Text("Acknowledge")
                        }
                    } else {
                        Text("Acknowledged")
                    }
                }
            }
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
