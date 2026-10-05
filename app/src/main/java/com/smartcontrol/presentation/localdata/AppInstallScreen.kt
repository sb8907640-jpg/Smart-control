package com.smartcontrol.presentation.localdata

import android.content.Intent
import android.net.Uri
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
            if (pkg.isNotEmpty()) {
                val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:" + pkg))
                runCatching { context.startActivity(intent) }
            }
        }, modifier = Modifier.fillMaxWidth()) { Text("Open system uninstall confirmation") }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
