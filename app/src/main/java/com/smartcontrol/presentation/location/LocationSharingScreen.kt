package com.smartcontrol.presentation.location
import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun LocationSharingScreen(onBack: () -> Unit, viewModel: LocationSharingViewModel = hiltViewModel()) {
    val sharing by viewModel.sharing.collectAsState()
    val last by viewModel.lastLocation.collectAsState()
    val message by viewModel.message.collectAsState()
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        if (viewModel.hasPermission) {
            viewModel.publishCurrentLocation()
        } else {
            android.widget.Toast.makeText(
                context,
                "Location permission was denied. Location was not shared.",
                android.widget.Toast.LENGTH_LONG
            ).show()
        }
    }
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Location Sharing", style = MaterialTheme.typography.headlineSmall)
        Text("Location is shared only after Android permission and an explicit Share action.")
        Button({
            if (viewModel.hasPermission) viewModel.publishCurrentLocation()
            else launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }, Modifier.fillMaxWidth()) { Text(if (sharing) "Update shared location" else "Share my location") }
        if (sharing) OutlinedButton({ viewModel.stopSharing() }, Modifier.fillMaxWidth()) { Text("Stop location sharing") }
        message?.let { Text(it) }
        last?.let { location ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("Last shared location", style = MaterialTheme.typography.titleMedium)
                    Text("Latitude: ${location.latitude}")
                    Text("Longitude: ${location.longitude}")
                    Text("Accuracy: ${location.accuracyMeters ?: -1f} m")
                }
            }
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
