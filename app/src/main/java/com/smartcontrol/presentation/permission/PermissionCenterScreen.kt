package com.smartcontrol.presentation.permission

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat

@Composable
fun PermissionCenterScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val permissions = remember {
        listOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.READ_SMS,
            Manifest.permission.READ_CALL_LOG
        )
    }
    var oneByOneIndex by remember { mutableIntStateOf(0) }
    var oneByOneActive by remember { mutableStateOf(false) }

    val allLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { }

    val oneLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {
        oneByOneIndex += 1
    }

    LaunchedEffect(oneByOneActive, oneByOneIndex) {
        if (oneByOneActive && oneByOneIndex < permissions.size) {
            oneLauncher.launch(permissions[oneByOneIndex])
        } else if (oneByOneActive) {
            oneByOneActive = false
            oneByOneIndex = 0
        }
    }

    fun granted(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    fun startOneByOne() {
        oneByOneIndex = 0
        oneByOneActive = true
    }

    fun open(action: String) {
        runCatching { context.startActivity(Intent(action)) }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Permission Center", style = MaterialTheme.typography.headlineSmall)
        Text(
            "This screen covers the Android permissions and special-access controls used by the 19-feature master specification. " +
                "System settings are always the authority; no permission is silently granted."
        )

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Runtime permissions", style = MaterialTheme.typography.titleMedium)
                Text("Camera: " + if (granted(Manifest.permission.CAMERA)) "Granted" else "Not granted")
                Text("Microphone: " + if (granted(Manifest.permission.RECORD_AUDIO)) "Granted" else "Not granted")
                Text(
                    "Location: " + if (
                        granted(Manifest.permission.ACCESS_FINE_LOCATION) ||
                        granted(Manifest.permission.ACCESS_COARSE_LOCATION)
                    ) "Granted" else "Not granted"
                )
                Text("Contacts: " + if (granted(Manifest.permission.READ_CONTACTS)) "Granted" else "Not granted")
                Text("SMS: " + if (granted(Manifest.permission.READ_SMS)) "Granted" else "Not granted")
                Text("Call logs: " + if (granted(Manifest.permission.READ_CALL_LOG)) "Granted" else "Not granted")

                Button(
                    onClick = {
                        allLauncher.launch(permissions.toTypedArray())
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("क्रमवार सभी अनुमतियाँ दें") }

                OutlinedButton(
                    onClick = { startOneByOne() },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("एक-एक करके अनुमति दें") }

                Text(
                    "दोनों विकल्प Android के असली system permission dialogs खोलते हैं। " +
                        "किसी permission को अपने-आप मंजूर नहीं किया जाता; हर dialog पर device user को स्वयं Allow या Deny करना होता है।"
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
