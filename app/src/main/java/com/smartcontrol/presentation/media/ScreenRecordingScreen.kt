package com.smartcontrol.presentation.media

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.smartcontrol.service.ScreenRecordingService
import kotlinx.coroutines.delay

@Composable
fun ScreenRecordingScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val preferences = remember(context) {
        context.getSharedPreferences(ScreenRecordingService.PREFS, Context.MODE_PRIVATE)
    }
    var recording by remember { mutableStateOf(preferences.getBoolean(ScreenRecordingService.KEY_ACTIVE, false)) }
    var lastRecording by remember { mutableStateOf(preferences.getString(ScreenRecordingService.KEY_LAST_RECORDING, null)) }
    var message by remember { mutableStateOf(preferences.getString(ScreenRecordingService.KEY_ERROR, "").orEmpty()) }

    val consentLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data
        if (result.resultCode == Activity.RESULT_OK && data != null) {
            val startIntent = Intent(context, ScreenRecordingService::class.java).apply {
                action = ScreenRecordingService.ACTION_START
                putExtra(ScreenRecordingService.EXTRA_RESULT_CODE, result.resultCode)
                putExtra(ScreenRecordingService.EXTRA_RESULT_DATA, data)
            }
            runCatching { ContextCompat.startForegroundService(context, startIntent) }
                .onSuccess { message = "Recording is starting. The ongoing notification includes a Stop action." }
                .onFailure { message = it.message ?: "Could not start screen recording." }
        } else {
            message = "Screen recording was canceled. No recording was started."
        }
    }

    LaunchedEffect(preferences) {
        while (true) {
            recording = preferences.getBoolean(ScreenRecordingService.KEY_ACTIVE, false)
            lastRecording = preferences.getString(ScreenRecordingService.KEY_LAST_RECORDING, null)
            message = preferences.getString(ScreenRecordingService.KEY_ERROR, "").orEmpty()
            delay(900)
        }
    }

    Column(
        Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Screen Recording", style = MaterialTheme.typography.headlineSmall)
        Text("Each recording requires Android's own screen-capture consent. Recording is local, has a visible ongoing notification, and can be stopped from the app or notification.")
        Text("No microphone audio is recorded by this feature.")
        Text("Status: " + if (recording) "RECORDING" else "STOPPED")
        Button(
            onClick = {
                val manager = context.getSystemService(MediaProjectionManager::class.java)
                if (manager == null) {
                    message = "Android MediaProjection is unavailable on this device."
                } else {
                    consentLauncher.launch(manager.createScreenCaptureIntent())
                }
            },
            enabled = !recording,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Start recording (system consent)") }
        OutlinedButton(
            onClick = {
                context.startService(Intent(context, ScreenRecordingService::class.java).setAction(ScreenRecordingService.ACTION_STOP))
                message = "Stopping and saving recording…"
            },
            enabled = recording,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Stop and save") }
        lastRecording?.let { reference ->
            Text("Last saved recording:")
            Text(reference, style = MaterialTheme.typography.bodySmall)
            if (reference.startsWith("content://")) {
                OutlinedButton(
                    onClick = {
                        val share = Intent(Intent.ACTION_SEND).apply {
                            type = "video/mp4"
                            putExtra(Intent.EXTRA_STREAM, Uri.parse(reference))
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        runCatching { context.startActivity(Intent.createChooser(share, "Share screen recording")) }
                            .onFailure { message = it.message ?: "Could not open the share sheet." }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Share saved recording") }
            }
        }
        if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.error)
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
