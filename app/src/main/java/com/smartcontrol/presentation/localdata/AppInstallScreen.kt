package com.smartcontrol.presentation.localdata

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

@Composable
fun AppInstallScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    var packageName by remember { mutableStateOf("") }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        uri?.let {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = it
                type = "application/vnd.android.package-archive"
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            runCatching { context.startActivity(intent) }
                .onFailure {
                    Toast.makeText(
                        context,
                        "Could not open the Android installer for this APK.",
                        Toast.LENGTH_LONG
                    ).show()
                }
        }
    }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("App Install / Uninstall", style = MaterialTheme.typography.headlineSmall)
        Text("Only the Android system installer/uninstaller is used. The user must confirm the action.")
        Button(onClick = { picker.launch(arrayOf("application/vnd.android.package-archive")) }, modifier = Modifier.fillMaxWidth()) {
            Text("Select APK and open system installer")
        }
        OutlinedTextField(
            value = packageName,
            onValueChange = { packageName = it },
            label = { Text("Package name to uninstall") },
            modifier = Modifier.fillMaxWidth()
        )
        Button(onClick = {
            val pkg = packageName.trim()
            if (!pkg.matches(Regex("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+"))) {
                Toast.makeText(context, "Enter a valid Android package name.", Toast.LENGTH_LONG).show()
            } else {
                val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:" + pkg))
                runCatching { context.startActivity(intent) }
                    .onFailure {
                        Toast.makeText(
                            context,
                            "Could not open the Android uninstall confirmation.",
                            Toast.LENGTH_LONG
                        ).show()
                    }
            }
        }, modifier = Modifier.fillMaxWidth()) { Text("Open system uninstall confirmation") }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
