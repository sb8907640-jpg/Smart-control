package com.smartcontrol.presentation.session

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

private fun networkLabel(capabilities: NetworkCapabilities?): String = when {
    capabilities == null -> "Checking connection"
    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) -> "Online"
    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) -> "Limited"
    else -> "Connected, no internet"
}

private fun readNetworkStatus(context: Context): String {
    val manager = context.getSystemService(ConnectivityManager::class.java) ?: return "Offline"
    val network = manager.activeNetwork ?: return "Offline"
    return networkLabel(manager.getNetworkCapabilities(network))
}

@Composable
private fun rememberNetworkStatus(): String {
    val context = LocalContext.current
    var status by remember(context) { mutableStateOf(readNetworkStatus(context)) }
    DisposableEffect(context) {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                status = networkLabel(manager?.getNetworkCapabilities(network))
            }
            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                status = networkLabel(networkCapabilities)
            }
            override fun onLost(network: Network) {
                status = readNetworkStatus(context)
            }
        }
        if (manager != null) {
            runCatching { manager.registerDefaultNetworkCallback(callback) }
            status = readNetworkStatus(context)
        } else {
            status = "Offline"
        }
        onDispose {
            if (manager != null) runCatching { manager.unregisterNetworkCallback(callback) }
        }
    }
    return status
}

@Composable
fun SessionScreen(
    running: Boolean,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onOpenPairing: () -> Unit,
    onOpenFeatures: () -> Unit,
    autoStart: Boolean,
    onAutoStartChanged: (Boolean) -> Unit
) {
    val networkStatus = rememberNetworkStatus()
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            if (running) "RUNNING" else "STOPPED",
            style = MaterialTheme.typography.headlineMedium
        )
        Spacer(Modifier.height(8.dp))
        Text("Network: $networkStatus", style = MaterialTheme.typography.titleMedium)
        Text(
            "Online means Android validated internet access. Limited means a network is present but internet validation is unavailable.",
            style = MaterialTheme.typography.bodySmall
        )
        Spacer(Modifier.height(16.dp))

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

        OutlinedButton(onClick = onOpenPairing, modifier = Modifier.fillMaxWidth()) {
            Text("Device Pairing")
        }
        OutlinedButton(onClick = onOpenFeatures, modifier = Modifier.fillMaxWidth()) {
            Text("Family Suraksha - All Features")
        }

        Spacer(Modifier.height(16.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Automatic Service Start", modifier = Modifier.weight(1f))
            Switch(checked = autoStart, onCheckedChange = onAutoStartChanged)
        }

        Spacer(Modifier.height(12.dp))

        Text(
            if (running)
                "Approved permissions may continue while the service runs in the background."
            else
                "Automatic start is optional. Android permissions are never granted silently in the background.",
            style = MaterialTheme.typography.bodyMedium
        )
    }
}
