package com.smartcontrol.presentation.privacy

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.service.FamilySafetyService

@Composable
fun PrivacyControlsScreen(onBack: () -> Unit, context: Context) {
    val prefs = remember { context.getSharedPreferences("privacy_controls", Context.MODE_PRIVATE) }
    var sessionRequests by remember { mutableStateOf(prefs.getBoolean("allow_session_requests", true)) }
    var locationSharing by remember { mutableStateOf(prefs.getBoolean("allow_location_sharing", true)) }
    var fileTransfers by remember { mutableStateOf(prefs.getBoolean("allow_file_transfers", true)) }
    var mediaSharing by remember { mutableStateOf(prefs.getBoolean("allow_media_sharing", true)) }
    var deviceHealthSharing by remember { mutableStateOf(prefs.getBoolean("allow_device_health_sharing", false)) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var deleted by remember { mutableStateOf(false) }

    fun save(key: String, value: Boolean) = prefs.edit().putBoolean(key, value).apply()

    Column(
        Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Privacy Controls", style = MaterialTheme.typography.headlineSmall)
        Text(
            "These controls limit Smart Control requests on this device. Android permissions and visible user consent remain required."
        )

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Remote session requests")
                    Switch(sessionRequests, { sessionRequests = it; save("allow_session_requests", it) })
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Location sharing")
                    Switch(locationSharing, { locationSharing = it; save("allow_location_sharing", it) })
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("File transfers")
                    Switch(fileTransfers, { fileTransfers = it; save("allow_file_transfers", it) })
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Camera / microphone / screen")
                    Switch(mediaSharing, { mediaSharing = it; save("allow_media_sharing", it) })
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Share device health & permission status")
                    Switch(deviceHealthSharing, {
                        deviceHealthSharing = it
                        save("allow_device_health_sharing", it)
                    })
                }
                Text("When enabled, only service heartbeat and permission-state changes are sent to the linked account. Contacts, SMS, call logs, and clipboard remain local-only.")
            }
        }

        Text(
            "Turning a control off does not revoke Android permissions. Use Android Settings or Permission Center to revoke a system permission."
        )

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Delete local app data", style = MaterialTheme.typography.titleMedium)
                Text(
                    "This clears Smart Control's locally stored privacy/legal preferences and stops the visible background service. " +
                        "It does not erase Firebase billing, audit, or other server records."
                )
                Button(
                    onClick = { showDeleteDialog = true },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Delete local data") }
                if (deleted) {
                    Text("Local app data cleared. Sign-in was also ended on this device.")
                }
            }
        }

        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete local data?") },
            text = {
                Text(
                    "This removes local Smart Control preferences and legal-consent state, stops the service, " +
                        "and signs out this device. Server-side records are not deleted by this action."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    FamilySafetyService.stop(context)
                    context.getSharedPreferences("privacy_controls", Context.MODE_PRIVATE).edit().clear().apply()
                    context.getSharedPreferences("legal_consent", Context.MODE_PRIVATE).edit().clear().apply()
                    FirebaseAuth.getInstance().signOut()
                    deleted = true
                    showDeleteDialog = false
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text("Cancel") }
            }
        )
    }
}
