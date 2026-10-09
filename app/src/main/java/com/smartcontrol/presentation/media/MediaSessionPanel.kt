package com.smartcontrol.presentation.media

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import org.webrtc.SurfaceViewRenderer
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.smartcontrol.domain.media.MediaCapability
import com.smartcontrol.domain.media.MediaSessionStatus
import com.smartcontrol.domain.spec.FeatureId
import com.smartcontrol.presentation.features.FeatureAccessViewModel

@Composable
fun MediaSessionPanel(
    onBack: () -> Unit,
    viewModel: MediaSessionViewModel = hiltViewModel(),
    featureAccess: FeatureAccessViewModel = hiltViewModel()
) {
    val device by viewModel.controlledDevice.collectAsState()
    val ownerSettings by featureAccess.settings.collectAsState()
    val settingsLoaded = ownerSettings != null
    val pending by viewModel.pending.collectAsState()
    val session by viewModel.selectedSession.collectAsState()
    val error by viewModel.lastError.collectAsState()
    val context = LocalContext.current
    val renderer = remember { SurfaceViewRenderer(context) }
    var pendingStart by remember { mutableStateOf<com.smartcontrol.domain.media.MediaSession?>(null) }

    val projectionLauncher = rememberMediaProjectionConsentLauncher { result ->
        pendingStart?.let { current -> if (result != null) viewModel.startPublishing(current, result) }
        pendingStart = null
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        pendingStart?.let { current ->
            if (MediaCapability.SCREEN_SHARING in current.capabilities) projectionLauncher()
            else { viewModel.startPublishing(current, null); pendingStart = null }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Consent-based media session", style = MaterialTheme.typography.titleMedium)
        device?.let {
            Text("Paired client: " + it.deviceUid)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Button(
                    onClick = { viewModel.request(setOf(MediaCapability.CAMERA)) },
                    enabled = settingsLoaded && featureAccess.isGloballyEnabled(FeatureId.CAMERA)
                ) { Text("Request camera") }
                Button(
                    onClick = { viewModel.request(setOf(MediaCapability.MICROPHONE)) },
                    enabled = settingsLoaded && featureAccess.isGloballyEnabled(FeatureId.MICROPHONE)
                ) { Text("Request mic") }
                Button(
                    onClick = { viewModel.request(setOf(MediaCapability.SCREEN_SHARING)) },
                    enabled = settingsLoaded && featureAccess.isGloballyEnabled(FeatureId.SCREEN_SHARE)
                ) { Text("Request screen") }
            }
        } ?: Text("No controlled device is paired on this account.")

        pending.forEach { request ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Incoming support request")
                    Text("Capabilities: " + request.capabilities.joinToString())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button({ viewModel.approve(request.sessionId) }) { Text("Approve") }
                        OutlinedButton({ viewModel.deny(request.sessionId) }) { Text("Deny") }
                    }
                }
            }
        }

        session?.let { current ->
            Text("Session: " + current.status)
            if (current.status == MediaSessionStatus.APPROVED) {
                Button({
                    pendingStart = current
                    val permissions = buildList {
                        if (MediaCapability.CAMERA in current.capabilities) add(Manifest.permission.CAMERA)
                        if (MediaCapability.MICROPHONE in current.capabilities) add(Manifest.permission.RECORD_AUDIO)
                    }
                    if (permissions.isEmpty()) {
                        if (MediaCapability.SCREEN_SHARING in current.capabilities) projectionLauncher()
                        else { viewModel.startPublishing(current, null); pendingStart = null }
                    } else permissionLauncher.launch(permissions.toTypedArray())
                }) { Text("Start sharing (visible)") }
            }
            if (device != null && current.status == MediaSessionStatus.ACTIVE) {
                WebRtcVideoRenderer(viewModel.eglBase(), renderer, Modifier.fillMaxWidth().height(220.dp))
                LaunchedEffect(current.sessionId) { viewModel.connectViewer(current, renderer) }
            }
            if (current.status == MediaSessionStatus.REQUESTED || current.status == MediaSessionStatus.APPROVED || current.status == MediaSessionStatus.ACTIVE) {
                OutlinedButton({ viewModel.stop(current.sessionId) }) { Text("Stop session") }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back to features") }
    }
}
