package com.smartcontrol.presentation.health

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

data class DeviceStatusSnapshot(
    val model: String,
    val androidVersion: String,
    val batteryPercent: Int?,
    val charging: Boolean,
    val network: String
)

private fun readDeviceStatus(context: Context): DeviceStatusSnapshot {
    val batteryManager = context.getSystemService(BatteryManager::class.java)
    val battery = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 }
    val charging = batteryManager?.isCharging == true
    val connectivity = context.getSystemService(ConnectivityManager::class.java)
    val network = connectivity?.activeNetwork?.let { active ->
        connectivity.getNetworkCapabilities(active)?.let { caps ->
            when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile data"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "VPN"
                else -> "Connected"
            }
        }
    } ?: "Offline"
    return DeviceStatusSnapshot(
        model = Build.MANUFACTURER.replaceFirstChar { it.uppercase() } + " " + Build.MODEL,
        androidVersion = Build.VERSION.RELEASE, batteryPercent = battery, charging = charging, network = network
    )
}

@Composable
fun DeviceStatusScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    var status by remember { mutableStateOf(readDeviceStatus(context)) }
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Device Status", style = MaterialTheme.typography.headlineSmall)
        Text("Local device health is read on-device. No hidden collection is performed.")
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Device: " + status.model)
                Text("Android: " + status.androidVersion)
                Text("Battery: " + (status.batteryPercent?.let { "$it%" } ?: "Unavailable"))
                Text("Power: " + if (status.charging) "Charging" else "Not charging")
                Text("Network: " + status.network)
            }
        }
        Button(onClick = { status = readDeviceStatus(context) }, modifier = Modifier.fillMaxWidth()) { Text("Refresh status") }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}