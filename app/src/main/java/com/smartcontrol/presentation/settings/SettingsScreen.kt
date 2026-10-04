package com.smartcontrol.presentation.settings

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onEndSession: () -> Unit,
    onPairing: () -> Unit,
    onPermissions: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val ui by viewModel.state
    var pin by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Settings", style = MaterialTheme.typography.headlineSmall)
        Text("Session controls, pairing and permission access are visible here.")

        Button(onClick = onPairing, modifier = Modifier.fillMaxWidth()) {
            Text("Device Pairing")
        }
        Button(onClick = onPermissions, modifier = Modifier.fillMaxWidth()) {
            Text("Permission Center")
        }

        OutlinedTextField(
            value = pin,
            onValueChange = { pin = it.filter(Char::isDigit).take(4) },
            label = { Text("Parent PIN") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Button(
            onClick = { viewModel.verifyAndEndSession(pin, onEndSession) },
            enabled = pin.length == 4,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("End remote support session")
        }
        ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }
    }
}
