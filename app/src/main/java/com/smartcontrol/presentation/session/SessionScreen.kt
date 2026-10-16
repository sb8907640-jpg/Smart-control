package com.smartcontrol.presentation.session

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.presentation.pairing.PairingViewModel

@Composable
fun SessionScreen(
    running: Boolean,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onOpenPairing: () -> Unit,
    onOpenFeatures: () -> Unit,
    onOpenSettings: () -> Unit,
    autoStart: Boolean,
    onAutoStartChanged: (Boolean) -> Unit,
    pairingViewModel: PairingViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val user = FirebaseAuth.getInstance().currentUser
    val currentUid = user?.uid.orEmpty()
    val displayName = user?.displayName?.takeIf { it.isNotBlank() }
        ?: user?.email?.substringBefore("@")?.takeIf { it.isNotBlank() }
        ?: "Family member"
    val devices by pairingViewModel.controlledDevices.collectAsState()
    val pairedSide by pairingViewModel.pairing.collectAsState()
    var networkLabel by remember { mutableStateOf(readNetworkLabel(context)) }

    DisposableEffect(context) {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { networkLabel = readNetworkLabel(context) }
            override fun onLost(network: Network) { networkLabel = readNetworkLabel(context) }
            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                networkLabel = labelNetworkCapabilities(networkCapabilities)
            }
        }
        runCatching { manager?.registerDefaultNetworkCallback(callback) }
        onDispose { runCatching { manager?.unregisterNetworkCallback(callback) } }
    }

    val isReceiverPaired = pairedSide != null && pairedSide?.controllerUid != currentUid
    val linkedCount = devices.size + if (isReceiverPaired) 1 else 0

    Column(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Family Suraksha", style = MaterialTheme.typography.headlineMedium)
                    Text("Welcome, $displayName", style = MaterialTheme.typography.titleMedium)
                    Text("Linked devices: $linkedCount")
                    Text("Network: $networkLabel")
                    Text("Weak signal may slow transfers or live media; a working internet connection is required for remote linking.")
                }
            }
        }
        item {
            Button(onClick = onOpenPairing, modifier = Modifier.fillMaxWidth()) {
                Text("GENERATE LINK / DEVICE LINK")
            }
        }
        item {
            Text("My Devices", style = MaterialTheme.typography.titleLarge)
            if (devices.isEmpty() && !isReceiverPaired) {
                Text("No devices linked yet. Generate a link on one device, then open it on the other device.")
            }
        }
        items(devices, key = { it.deviceUid }) { device ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Linked device", style = MaterialTheme.typography.titleMedium)
                    Text("Device ID: " + device.deviceUid)
                    Text(if (device.active) "Status: Paired" else "Status: Not connected")
                }
            }
        }
        if (isReceiverPaired) {
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("This device is linked", style = MaterialTheme.typography.titleMedium)
                        Text("Controller ID: " + pairedSide!!.controllerUid)
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(if (running) "SERVICE RUNNING" else "SERVICE STOPPED", style = MaterialTheme.typography.titleMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(onClick = onStart, enabled = !running, modifier = Modifier.weight(1f)) { Text("START") }
                        OutlinedButton(onClick = onStop, enabled = running, modifier = Modifier.weight(1f)) { Text("STOP") }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
                    ) {
                        Text("Automatic Service Start", modifier = Modifier.weight(1f))
                        Switch(checked = autoStart, onCheckedChange = onAutoStartChanged)
                    }
                    Text("Android permissions are never granted silently. Camera, microphone, and screen sharing require visible user consent.")
                    Text("Android 15+ limits data-sync foreground services to six hours per 24-hour period and blocks automatic data-sync start directly after reboot. If sync pauses, open the app to resume; device and manufacturer power settings may also interrupt background work.")
                }
            }
        }
        }
        NavigationBar {
            NavigationBarItem(
                selected = true,
                onClick = {},
                icon = { Text("⌂") },
                label = { Text("Home") }
            )
            NavigationBarItem(
                selected = false,
                onClick = onOpenPairing,
                icon = { Text("↔") },
                label = { Text("Devices") }
            )
            NavigationBarItem(
                selected = false,
                onClick = onOpenFeatures,
                icon = { Text("▦") },
                label = { Text("Features") }
            )
            NavigationBarItem(
                selected = false,
                onClick = onOpenSettings,
                icon = { Text("⚙") },
                label = { Text("Settings") }
            )
        }
    }
}

private fun labelNetworkCapabilities(capabilities: NetworkCapabilities): String {
    val type = when {
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile data"
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
        else -> "Internet"
    }
    return when {
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) -> "Online • $type"
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) -> "Limited • $type"
        else -> "Connected • no internet"
    }
}

private fun readNetworkLabel(context: Context): String {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        ?: return "Status unavailable"
    val network = manager.activeNetwork ?: return "Offline"
    val capabilities = manager.getNetworkCapabilities(network) ?: return "Offline"
    val type = when {
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile data"
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
        else -> "Internet"
    }
    return when {
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) -> "Online • $type"
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) -> "Limited • $type"
        else -> "Connected • no internet"
    }
}
