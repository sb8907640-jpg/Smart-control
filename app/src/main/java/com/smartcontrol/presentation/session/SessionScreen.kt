package com.smartcontrol.presentation.session

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.smartcontrol.presentation.media.MediaSessionPanel

@Composable
fun SessionScreen(
    onSettings: () -> Unit,
    viewModel: SessionViewModel = hiltViewModel()
) {
    val active by viewModel.active.collectAsState()
    val pending by viewModel.pending.collectAsState()

    Column(
        Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Family Safety", style = MaterialTheme.typography.headlineSmall)
        Text("Sessions are visible and require explicit consent.")

        active?.let {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("REMOTE SESSION ACTIVE")
                    Text("Reason: " + it.request.reason)
                    Text("Capabilities: " + it.request.capabilities.joinToString())
                }
            }
        }

        pending.forEach { request ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Support request")
                    Text(request.reason)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button({ viewModel.approve(request.sessionId) }) { Text("Approve") }
                        Button({ viewModel.deny(request.sessionId) }) { Text("Deny") }
                    }
                }
            }
        }

        MediaSessionPanel()

        Button(viewModel::demoRequest) { Text("Create legacy test request") }
        Button(onClick = onSettings) { Text("Settings") }
    }
}
