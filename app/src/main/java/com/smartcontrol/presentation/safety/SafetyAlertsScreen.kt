package com.smartcontrol.presentation.safety

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.util.UUID

@Composable
fun SafetyAlertsScreen(onBack: () -> Unit) {
    var alerts by remember { mutableStateOf(listOf<Pair<String,String>>()) }
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Safety Alerts", style = MaterialTheme.typography.headlineSmall)
        Text("Alerts are visible to the signed-in device user. No hidden monitoring is used.")
        Button(onClick = { alerts = listOf("Test alert" to "Safety alert created locally.") + alerts }) {
            Text("Create test alert")
        }
        alerts.forEach { (type, message) ->
            Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) { Text(type); Text(message) } }
        }
        OutlinedButton(onClick = onBack) { Text("Back") }
    }
}
