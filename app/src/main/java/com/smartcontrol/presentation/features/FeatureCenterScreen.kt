package com.smartcontrol.presentation.features

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

private data class FeatureRow(
    val number: Int,
    val name: String,
    val status: String,
    val detail: String
)

private val features = listOf(
    FeatureRow(1, "Location", "READY", "Explicit location permission and visible share/stop controls."),
    FeatureRow(2, "Notifications", "READY", "Visible notification permission and foreground status notification."),
    FeatureRow(3, "Battery & Network", "READY", "Local device health/status screen."),
    FeatureRow(4, "Camera", "READY", "Camera publishing is available only in an approved visible media session."),
    FeatureRow(5, "Microphone", "READY", "Microphone publishing is available only in an approved visible media session."),
    FeatureRow(6, "Gallery", "USER-SELECTED", "Files/media can be selected through Android's system picker; no background gallery scan."),
    FeatureRow(7, "Screen Share", "READY", "MediaProjection requires the Android system consent dialog and visible session state."),
    FeatureRow(8, "Screen Recording", "CONSENT-GATED", "Screen capture transport uses MediaProjection; hidden/background recording is not used."),
    FeatureRow(9, "Touch Control", "SAFETY-GATED", "Session command validation exists; arbitrary remote touch injection is not enabled."),
    FeatureRow(10, "Keyboard Input", "SAFETY-GATED", "Session command validation exists; arbitrary remote keyboard injection is not enabled."),
    FeatureRow(11, "App Install / Uninstall", "SYSTEM-CONFIRMED", "APK selection opens the Android installer; uninstall opens the Android system confirmation."),
    FeatureRow(12, "File Transfer", "READY", "User-selected files require receiver approval before upload."),
    FeatureRow(13, "Clipboard Sync", "LOCAL-ONLY", "Visible clipboard read/copy tools; no background monitoring or remote clipboard collection."),
    FeatureRow(14, "Files Access", "USER-SELECTED", "Android Storage Access Framework is used instead of directory scanning."),
    FeatureRow(15, "Contacts", "LOCAL-ONLY", "Explicit READ_CONTACTS permission and visible local viewer; no remote collection."),
    FeatureRow(16, "SMS", "LOCAL-ONLY", "Explicit READ_SMS permission and visible read-only local viewer; no remote collection."),
    FeatureRow(17, "Call Logs", "LOCAL-ONLY", "Explicit READ_CALL_LOG permission and visible read-only local viewer; no remote collection."),
    FeatureRow(18, "App Usage", "LOCAL-ONLY", "Explicit Android Usage Access special permission and visible local statistics; no hidden monitoring."),
    FeatureRow(19, "SOS Alerts", "READY", "Visible SOS alert creation and acknowledgement are supported.")
)

@Composable
fun FeatureCenterScreen(onBack: () -> Unit, onNotifications: () -> Unit, onContacts: () -> Unit, onSms: () -> Unit, onCallLogs: () -> Unit, onAppUsage: () -> Unit, onClipboard: () -> Unit, onAppInstall: () -> Unit) {
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    it,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            }
        }
    }

    Column(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Feature Center", style = MaterialTheme.typography.headlineSmall)
        Text("All 19 master features are listed here. Sensitive capabilities remain visible, consent-gated, and subject to Android OS security.")
        OutlinedButton(
            onClick = { picker.launch(arrayOf("image/*", "video/*")) },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Open Gallery Picker") }
        OutlinedButton(onClick = onNotifications, modifier = Modifier.fillMaxWidth()) { Text("Notification Access") }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onContacts, modifier = Modifier.weight(1f)) { Text("Contacts") }
            OutlinedButton(onClick = onSms, modifier = Modifier.weight(1f)) { Text("SMS") }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onCallLogs, modifier = Modifier.weight(1f)) { Text("Call Logs") }
            OutlinedButton(onClick = onAppUsage, modifier = Modifier.weight(1f)) { Text("App Usage") }
        }
        OutlinedButton(onClick = onClipboard, modifier = Modifier.fillMaxWidth()) { Text("Clipboard (local)") }
        OutlinedButton(onClick = onAppInstall, modifier = Modifier.fillMaxWidth()) { Text("App Install / Uninstall") }
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.weight(1f)
        ) {
            items(features) { item ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("${item.number}. ${item.name}", style = MaterialTheme.typography.titleMedium)
                        Text(item.status, style = MaterialTheme.typography.labelMedium)
                        Text(item.detail)
                    }
                }
            }
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
