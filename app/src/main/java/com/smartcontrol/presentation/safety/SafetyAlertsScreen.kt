package com.smartcontrol.presentation.safety

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun SafetyAlertsScreen(
    onBack: () -> Unit,
    viewModel: SafetyAlertsViewModel = hiltViewModel()
) {
    val alerts by viewModel.alerts.collectAsState()
    val status by viewModel.status.collectAsState()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("Safety Alerts", style = MaterialTheme.typography.headlineSmall)
            Text("Alerts are visible to the signed-in device user. No hidden monitoring is used.")
        }
        item {
            Button(
                onClick = viewModel::triggerSos,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
            ) {
                Text("Trigger SOS")
            }
        }
        item {
            OutlinedButton(
                onClick = viewModel::createTestAlert,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Create test alert")
            }
        }
        if (alerts.isEmpty()) {
            item { Text("No safety alerts.") }
        }
        items(alerts, key = { it.alertId }) { alert ->
            Card(Modifier.fillMaxWidth()) {
                androidx.compose.foundation.layout.Column(
                    Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
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
        item {
            status?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
        }
        item {
            OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text("Back")
            }
        }
    }
}
