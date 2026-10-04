package com.smartcontrol.presentation.privacy

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun PrivacyControlsScreen(onBack: () -> Unit, context: Context) {
    val prefs = remember { context.getSharedPreferences("privacy_controls", Context.MODE_PRIVATE) }
    var sessionRequests by remember { mutableStateOf(prefs.getBoolean("allow_session_requests", true)) }
    var locationSharing by remember { mutableStateOf(prefs.getBoolean("allow_location_sharing", true)) }
    var fileTransfers by remember { mutableStateOf(prefs.getBoolean("allow_file_transfers", true)) }
    var mediaSharing by remember { mutableStateOf(prefs.getBoolean("allow_media_sharing", true)) }
    fun save(key: String, value: Boolean) = prefs.edit().putBoolean(key, value).apply()
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Privacy Controls", style = MaterialTheme.typography.headlineSmall)
        Text("These controls limit Smart Control requests on this device. Android permissions and visible user consent remain required.")
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Remote session requests"); Switch(sessionRequests, { sessionRequests = it; save("allow_session_requests", it) }) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Location sharing"); Switch(locationSharing, { locationSharing = it; save("allow_location_sharing", it) }) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("File transfers"); Switch(fileTransfers, { fileTransfers = it; save("allow_file_transfers", it) }) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Camera / microphone / screen"); Switch(mediaSharing, { mediaSharing = it; save("allow_media_sharing", it) }) }
            }
        }
        Text("Turning a control off does not revoke Android permissions. Use Android Settings or Permission Center to revoke a system permission.")
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}