package com.smartcontrol.presentation.permission

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat

private data class PermissionItem(
    val label: String,
    val permissions: List<String>
)

@Composable
fun PermissionCenterScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val permissionItems = remember {
        listOf(
            PermissionItem("Camera", listOf(Manifest.permission.CAMERA)),
            PermissionItem("Microphone", listOf(Manifest.permission.RECORD_AUDIO)),
            PermissionItem(
                "Location",
                listOf(
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                    Manifest.permission.ACCESS_FINE_LOCATION
                )
            ),
            PermissionItem("Contacts", listOf(Manifest.permission.READ_CONTACTS)),
            PermissionItem("SMS", listOf(Manifest.permission.READ_SMS)),
            PermissionItem("Call logs", listOf(Manifest.permission.READ_CALL_LOG))
        )
    }

    var refreshTick by remember { mutableIntStateOf(0) }
    var sequentialIndex by remember { mutableIntStateOf(0) }
    var sequentialActive by remember { mutableStateOf(false) }
    var requestedItemIndex by remember { mutableIntStateOf(-1) }
    var skippedItems by remember { mutableStateOf(emptySet<Int>()) }

    fun granted(item: PermissionItem): Boolean =
        item.permissions.all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }

    val requestLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        refreshTick += 1
        if (sequentialActive) {
            sequentialIndex += 1
        }
        requestedItemIndex = -1
    }

    LaunchedEffect(sequentialActive, sequentialIndex, refreshTick) {
        if (sequentialActive && sequentialIndex < permissionItems.size) {
            requestedItemIndex = sequentialIndex
            requestLauncher.launch(permissionItems[sequentialIndex].permissions.toTypedArray())
        } else if (sequentialActive) {
            sequentialActive = false
            sequentialIndex = 0
            requestedItemIndex = -1
        }
    }

    fun requestItem(index: Int) {
        sequentialActive = false
        sequentialIndex = 0
        skippedItems = skippedItems - index
        requestedItemIndex = index
        requestLauncher.launch(permissionItems[index].permissions.toTypedArray())
    }

    fun startAllowAll() {
        sequentialIndex = 0
        sequentialActive = true
    }

    fun open(action: String) {
        runCatching { context.startActivity(Intent(action)) }
    }

    // Keep status reads tied to Compose state so the row updates after every system dialog.
    @Suppress("UNUSED_VARIABLE")
    val ignoredRefreshTick = refreshTick

    Column(
        modifier = Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Permission Center", style = MaterialTheme.typography.headlineSmall)
        Text(
            "हर permission पर User अपनी इच्छा से Allow, Deny या Skip कर सकता है। " +
                "Android system dialog ही अंतिम authority है; app किसी permission को silently grant नहीं करता।"
        )

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Permissions", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Allow All दबाने पर permissions एक-एक करके Android के असली system dialogs में खुलेंगी। " +
                        "हर dialog में User को खुद Allow या Deny करना होगा।"
                )

                permissionItems.forEachIndexed { index, item ->
                    val isGranted = granted(item)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(item.label, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                when {
                                    isGranted -> "Allowed"
                                    skippedItems.contains(index) -> "Skipped by user"
                                    else -> "Not allowed"
                                }
                            )
                        }
                        OutlinedButton(
                            onClick = { requestItem(index) },
                            enabled = !isGranted
                        ) {
                            Text(if (isGranted) "Allowed" else "Allow")
                        }
                        OutlinedButton(
                            onClick = {
                                skippedItems = skippedItems + index
                                refreshTick += 1
                            },
                            enabled = !isGranted
                        ) {
                            Text(if (skippedItems.contains(index)) "Skipped" else "Skip")
                        }
                    }
                }

                Button(
                    onClick = { startAllowAll() },
                    enabled = sequentialIndex == 0 && !sequentialActive,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("सबको Allow करें (Allow All)")
                }

                if (sequentialActive) {
                    Text(
                        "Allow All चल रहा है: हर Android dialog पर User स्वयं Allow या Deny कर सकता है। " +
                            "किसी dialog को Deny करने पर अगली permission पर चला जाएगा।"
                    )
                }

                Text(
                    "Skip का मतलब है कि app उस permission का system dialog अभी नहीं खोलेगा। " +
                        "वास्तविक Deny/Allow का निर्णय Android के system dialog में User स्वयं करता है। " +
                        "पहले से Allowed permission को revoke करने के लिए Android App Settings इस्तेमाल करें।"
                )
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Special Android access", style = MaterialTheme.typography.titleMedium)
                Text("Notification access: enabled only after the device user approves it in Android Settings.")
                OutlinedButton(
                    onClick = { open(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS) },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Open Notification Access") }

                Text("App Usage: requires Android Usage Access approval.")
                OutlinedButton(
                    onClick = { open(Settings.ACTION_USAGE_ACCESS_SETTINGS) },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Open Usage Access") }

                Text("Battery/background behavior is controlled by Android and the device manufacturer.")
                OutlinedButton(
                    onClick = {
                        open(
                            if (android.os.Build.VERSION.SDK_INT >= 26)
                                Settings.ACTION_APPLICATION_DETAILS_SETTINGS
                            else Settings.ACTION_SETTINGS
                        )
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Open App Settings") }
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Consent-gated capabilities", style = MaterialTheme.typography.titleMedium)
                Text("Screen share/recording uses MediaProjection system consent.")
                Text("Touch/keyboard control remains session- and OS-safety-gated.")
                Text("App install/uninstall uses Android system confirmation.")
                Text("File/gallery access uses the Android system picker.")
                Text("These capabilities are not silently enabled from this screen.")
            }
        }

        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
