package com.smartcontrol.presentation.session

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SessionScreen(
    running: Boolean,
    onStart: () -> Unit,
    onStop: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            if (running) "RUNNING" else "STOPPED",
            style = MaterialTheme.typography.headlineMedium
        )
        Spacer(Modifier.height(24.dp))

        Button(
            onClick = onStart,
            enabled = !running,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("START")
        }

        Spacer(Modifier.height(12.dp))

        OutlinedButton(
            onClick = onStop,
            enabled = running,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("STOP")
        }

        Spacer(Modifier.height(16.dp))

        Text(
            if (running)
                "Approved permissions may continue while the service runs in the background."
            else
                "Press START to begin. Android permissions are never granted silently in the background.",
            style = MaterialTheme.typography.bodyMedium
        )
    }
}
