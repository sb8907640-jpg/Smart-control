package com.smartcontrol.presentation.localdata

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
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
    var pendingApkUri by remember { mutableStateOf<Uri?>(null) }

    fun openInstaller(uri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        runCatching { context.startActivity(intent) }
            .onFailure {
                Toast.makeText(
                    context,
                    it.message ?: "Could not open the Android installer for this APK.",
                    Toast.LENGTH_LONG
                ).show()
            }
    }

    val installAccessSettings = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        val uri = pendingApkUri
        if (uri != null && (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls())) {
            openInstaller(uri)
        } else if (uri != null) {
            Toast.makeText(
                context,
                "Allow this app to install unknown apps in Android Settings before continuing.",
                Toast.LENGTH_LONG
            ).show()
        }
        pendingApkUri = null
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        uri?.let { selected ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
                val retained = runCatching {
                    context.contentResolver.takePersistableUriPermission(
                        selected,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    )
                }.isSuccess
                pendingApkUri = if (retained) selected else null
                if (!retained) {
                    Toast.makeText(
                        context,
                        "Allow install access in Settings, then select the APK again because this provider did not allow persistent file access.",
                        Toast.LENGTH_LONG
                    ).show()
                }
                val settingsIntent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${context.packageName}")
                )
                runCatching { installAccessSettings.launch(settingsIntent) }
                    .onFailure {
                        pendingApkUri = null
                        Toast.makeText(
                            context,
                            "Open Android Settings and allow this app to install unknown apps, then select the APK again.",
                            Toast.LENGTH_LONG
                        ).show()
                    }
            } else {
                openInstaller(selected)
            }
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("App Install / Uninstall", style = MaterialTheme.typography.headlineSmall)
        Text("Only the Android system installer/uninstaller is used. Unknown-app install access may need to be enabled in Android Settings. The user must confirm the installation.")
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
