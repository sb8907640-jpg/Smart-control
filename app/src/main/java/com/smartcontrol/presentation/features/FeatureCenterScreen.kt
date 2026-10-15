package com.smartcontrol.presentation.features

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.domain.spec.FeatureId

private data class FeatureRow(
    val number: Int,
    val featureId: FeatureId,
    val name: String,
    val status: String,
    val detail: String
)

private val features = listOf(
    FeatureRow(1, FeatureId.LOCATION, "Location", "READY", "Explicit location permission and visible share/stop controls."),
    FeatureRow(2, FeatureId.NOTIFICATIONS, "Notifications", "READY", "Visible notification permission and foreground status notification."),
    FeatureRow(3, FeatureId.BATTERY_NETWORK, "Battery & Network", "READY", "Local device health/status screen."),
    FeatureRow(4, FeatureId.CAMERA, "Camera", "READY", "Camera publishing is available only in an approved visible media session."),
    FeatureRow(5, FeatureId.MICROPHONE, "Microphone", "READY", "Microphone publishing is available only in an approved visible media session."),
    FeatureRow(6, FeatureId.GALLERY, "Gallery", "USER-SELECTED", "Files/media can be selected through Android's system picker; no background gallery scan."),
    FeatureRow(7, FeatureId.SCREEN_SHARE, "Screen Share", "READY", "MediaProjection requires the Android system consent dialog and visible session state."),
    FeatureRow(8, FeatureId.SCREEN_RECORDING, "Screen Recording", "CONSENT-GATED", "Local MP4 recording requires fresh Android MediaProjection consent and stays visible through a foreground notification with a Stop action."),
    FeatureRow(9, FeatureId.TOUCH_CONTROL, "Touch Control", "SAFETY-GATED", "Session command validation exists; arbitrary remote touch injection is not enabled."),
    FeatureRow(10, FeatureId.KEYBOARD_INPUT, "Keyboard Input", "SAFETY-GATED", "Session command validation exists; arbitrary remote keyboard injection is not enabled."),
    FeatureRow(11, FeatureId.APP_INSTALL, "App Install / Uninstall", "SYSTEM-CONFIRMED", "APK selection opens the Android installer; uninstall opens the Android system confirmation."),
    FeatureRow(12, FeatureId.FILE_TRANSFER, "File Transfer", "READY", "User-selected files require receiver approval before upload."),
    FeatureRow(13, FeatureId.CLIPBOARD_SYNC, "Clipboard Sync", "LOCAL-ONLY", "Visible clipboard read/copy tools; no background monitoring or remote clipboard collection."),
    FeatureRow(14, FeatureId.FILES_ACCESS, "Files Access", "USER-SELECTED", "Android Storage Access Framework is used instead of directory scanning."),
    FeatureRow(15, FeatureId.CONTACTS, "Contacts", "LOCAL-ONLY", "Explicit READ_CONTACTS permission and visible local viewer; no remote collection."),
    FeatureRow(16, FeatureId.SMS, "SMS", "LOCAL-ONLY", "Explicit READ_SMS permission and visible read-only local viewer; no remote collection."),
    FeatureRow(17, FeatureId.CALL_LOGS, "Call Logs", "LOCAL-ONLY", "Explicit READ_CALL_LOG permission and visible read-only local viewer; no remote collection."),
    FeatureRow(18, FeatureId.APP_USAGE, "App Usage", "LOCAL-ONLY", "Explicit Android Usage Access special permission and visible local statistics; no hidden monitoring."),
    FeatureRow(19, FeatureId.SOS_ALERTS, "SOS Alerts", "READY", "Visible SOS alert creation and acknowledgement are supported.")
)

@Composable
fun FeatureCenterScreen(
    onBack: () -> Unit,
    onNotifications: () -> Unit,
    onContacts: () -> Unit,
    onSms: () -> Unit,
    onCallLogs: () -> Unit,
    onAppUsage: () -> Unit,
    onClipboard: () -> Unit,
    onAppInstall: () -> Unit,
    onLocation: () -> Unit,
    onDeviceStatus: () -> Unit,
    onFileTransfer: () -> Unit,
    onPermissions: () -> Unit,
    onSafetyAlerts: () -> Unit,
    onBilling: () -> Unit,
    onProfile: () -> Unit,
    onMediaSession: () -> Unit,
    onScreenRecording: () -> Unit,
    onSettings: () -> Unit,
    featureAccess: FeatureAccessViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val ownerSettings by featureAccess.settings.collectAsState()
    val settingsLoaded = ownerSettings != null
    val userId = FirebaseAuth.getInstance().currentUser?.uid.orEmpty()
    val selectionPreferences = remember(context) {
        context.getSharedPreferences("family_suraksha_file_access", android.content.Context.MODE_PRIVATE)
    }
    var selectedMediaUri by remember(context) {
        mutableStateOf(selectionPreferences.getString("selected_media_uri", null))
    }
    var selectedFolderUri by remember(context) {
        mutableStateOf(selectionPreferences.getString("selected_folder_uri", null))
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { selectedUri ->
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    selectedUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            }.onSuccess {
                selectionPreferences.edit().putString("selected_media_uri", selectedUri.toString()).apply()
                selectedMediaUri = selectedUri.toString()
                Toast.makeText(context, "Selected media access saved.", Toast.LENGTH_SHORT).show()
            }.onFailure {
                Toast.makeText(context, "Media was selected, but persistent access could not be saved.", Toast.LENGTH_LONG).show()
            }
        }
    }
    val folderPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        uri?.let { selectedUri ->
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    selectedUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                )
            }.onSuccess {
                selectionPreferences.edit().putString("selected_folder_uri", selectedUri.toString()).apply()
                selectedFolderUri = selectedUri.toString()
                Toast.makeText(context, "Folder access granted and saved.", Toast.LENGTH_SHORT).show()
            }.onFailure { error ->
                Toast.makeText(
                    context,
                    error.message ?: "Folder selected, but persistent access could not be saved.",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        item {
            Text("Family Suraksha - Feature Center", style = MaterialTheme.typography.headlineSmall)
            Text("All 19 master features are listed here. Sensitive capabilities remain visible, consent-gated, and subject to Android OS security.")
        }
        item { OutlinedButton(onClick = onLocation, enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.LOCATION, userId), modifier = Modifier.fillMaxWidth()) { Text("Location Sharing") } }
        item { OutlinedButton(onClick = onDeviceStatus, enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.BATTERY_NETWORK, userId), modifier = Modifier.fillMaxWidth()) { Text("Battery & Network Status") } }
        item { OutlinedButton(onClick = onMediaSession, enabled = settingsLoaded && (featureAccess.isGloballyEnabled(FeatureId.CAMERA) || featureAccess.isGloballyEnabled(FeatureId.MICROPHONE) || featureAccess.isGloballyEnabled(FeatureId.SCREEN_SHARE)), modifier = Modifier.fillMaxWidth()) { Text("Consent-Based Camera / Microphone / Screen Session") } }
        item { OutlinedButton(onClick = onScreenRecording, enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.SCREEN_RECORDING, userId), modifier = Modifier.fillMaxWidth()) { Text("Record Screen (local, consent required)") } }
        item { OutlinedButton(onClick = onFileTransfer, enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.FILE_TRANSFER, userId), modifier = Modifier.fillMaxWidth()) { Text("Approved File Transfer") } }
        item { OutlinedButton(onClick = onPermissions, modifier = Modifier.fillMaxWidth()) { Text("Permission Center") } }
        item { OutlinedButton(onClick = onSafetyAlerts, enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.SOS_ALERTS, userId), modifier = Modifier.fillMaxWidth()) { Text("Safety / SOS Alerts") } }
        item { OutlinedButton(onClick = onBilling, modifier = Modifier.fillMaxWidth()) { Text("Plans & Billing") } }
        item { OutlinedButton(onClick = onProfile, modifier = Modifier.fillMaxWidth()) { Text("Profile & Privacy") } }
        item { OutlinedButton(onClick = onSettings, modifier = Modifier.fillMaxWidth()) { Text("Settings") } }
        item {
            OutlinedButton(
                onClick = { picker.launch(arrayOf("image/*", "video/*")) },
                enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.GALLERY, userId),
                modifier = Modifier.fillMaxWidth()
            ) { Text("Open Gallery Picker") }
        }
        item {
            selectedMediaUri?.let { uri ->
                Text("Saved media selection", style = MaterialTheme.typography.labelMedium)
                Text(uri, style = MaterialTheme.typography.bodySmall)
                OutlinedButton(
                    onClick = {
                        runCatching {
                            context.contentResolver.releasePersistableUriPermission(
                                Uri.parse(uri),
                                Intent.FLAG_GRANT_READ_URI_PERMISSION
                            )
                        }
                        selectionPreferences.edit().remove("selected_media_uri").apply()
                        selectedMediaUri = null
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Clear media selection") }
            }
        }
        item {
            OutlinedButton(
                onClick = { folderPicker.launch(null) },
                enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.FILES_ACCESS, userId),
                modifier = Modifier.fillMaxWidth()
            ) { Text("Open Files / Folder Picker") }
        }
        item {
            selectedFolderUri?.let { uri ->
                Text("Saved folder selection", style = MaterialTheme.typography.labelMedium)
                Text(uri, style = MaterialTheme.typography.bodySmall)
                OutlinedButton(
                    onClick = {
                        runCatching {
                            context.contentResolver.releasePersistableUriPermission(
                                Uri.parse(uri),
                                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                            )
                        }
                        selectionPreferences.edit().remove("selected_folder_uri").apply()
                        selectedFolderUri = null
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Clear folder selection") }
            }
        }
        item { OutlinedButton(onClick = onNotifications, enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.NOTIFICATIONS, userId), modifier = Modifier.fillMaxWidth()) { Text("Notification Access") } }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onContacts, enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.CONTACTS, userId), modifier = Modifier.weight(1f)) { Text("Contacts") }
                OutlinedButton(onClick = onSms, enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.SMS, userId), modifier = Modifier.weight(1f)) { Text("SMS") }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onCallLogs, enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.CALL_LOGS, userId), modifier = Modifier.weight(1f)) { Text("Call Logs") }
                OutlinedButton(onClick = onAppUsage, enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.APP_USAGE, userId), modifier = Modifier.weight(1f)) { Text("App Usage") }
            }
        }
        item { OutlinedButton(onClick = onClipboard, enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.CLIPBOARD_SYNC, userId), modifier = Modifier.fillMaxWidth()) { Text("Clipboard (local)") } }
        item { OutlinedButton(onClick = onAppInstall, enabled = settingsLoaded && featureAccess.isEnabled(FeatureId.APP_INSTALL, userId), modifier = Modifier.fillMaxWidth()) { Text("App Install / Uninstall") } }
        items(features) { feature ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${feature.number}. ${feature.name}", style = MaterialTheme.typography.titleMedium)
                    val enabled = settingsLoaded && featureAccess.isEnabled(feature.featureId, userId)
                    Text(
                        when {
                            !settingsLoaded -> "LOADING OWNER SETTINGS"
                            !enabled -> "DISABLED BY OWNER"
                            else -> feature.status
                        },
                        style = MaterialTheme.typography.labelMedium
                    )
                    Text(feature.detail)
                }
            }
        }
        item { OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") } }
    }
}
