package com.smartcontrol.presentation.media

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.smartcontrol.domain.media.MediaCapability
import com.smartcontrol.domain.media.MediaSessionStatus
import com.smartcontrol.domain.spec.FeatureId
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.presentation.features.FeatureAccessViewModel
import org.webrtc.SurfaceViewRenderer

@Composable
fun MediaSessionPanel(
    onBack: () -> Unit,
    viewModel: MediaSessionViewModel = hiltViewModel(),
    featureAccess: FeatureAccessViewModel = hiltViewModel()
) {
    val device by viewModel.controlledDevice.collectAsState()
    val ownerSettings by featureAccess.settings.collectAsState()
    val settingsLoaded = ownerSettings != null
    val userId = FirebaseAuth.getInstance().currentUser?.uid.orEmpty()
    fun capabilityEnabled(capability: MediaCapability): Boolean {
        val featureId = when (capability) {
            MediaCapability.CAMERA -> FeatureId.CAMERA
            MediaCapability.MICROPHONE -> FeatureId.MICROPHONE
            MediaCapability.SCREEN_SHARING -> FeatureId.SCREEN_SHARE
        }
        return settingsLoaded && featureAccess.isEnabled(featureId, userId)
    }
    fun capabilityGloballyEnabled(capability: MediaCapability): Boolean {
        val featureId = when (capability) {
            MediaCapability.CAMERA -> FeatureId.CAMERA
            MediaCapability.MICROPHONE -> FeatureId.MICROPHONE
            MediaCapability.SCREEN_SHARING -> FeatureId.SCREEN_SHARE
        }
        return settingsLoaded && featureAccess.isGloballyEnabled(featureId)
    }
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
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        pendingStart?.let { current ->
            val allGranted = results.values.all { it }
            if (!allGranted) {
                android.widget.Toast.makeText(
                    context,
                    "Camera/microphone permission denied. Sharing was not started.",
                    android.widget.Toast.LENGTH_LONG
                ).show()
                pendingStart = null
            } else if (MediaCapability.SCREEN_SHARING in current.capabilities) {
                projectionLauncher()
            } else {
                viewModel.startPublishing(current, null)
                pendingStart = null
            }
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            Text("Consent-based media session", style = MaterialTheme.typography.titleMedium)
            device?.let {
                Text("Paired client: " + it.deviceUid)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Button(
                        onClick = { viewModel.request(setOf(MediaCapability.CAMERA)) },
                        enabled = capabilityGloballyEnabled(MediaCapability.CAMERA)
                    ) { Text("Request camera") }
                    Button(
                        onClick = { viewModel.request(setOf(MediaCapability.MICROPHONE)) },
                        enabled = capabilityGloballyEnabled(MediaCapability.MICROPHONE)
                    ) { Text("Request mic") }
                    Button(
                        onClick = { viewModel.request(setOf(MediaCapability.SCREEN_SHARING)) },
                        enabled = capabilityGloballyEnabled(MediaCapability.SCREEN_SHARING)
                    ) { Text("Request screen") }
                }
            } ?: Text("No controlled device is paired on this account.")
        }

        items(pending, key = { it.sessionId }) { request ->
            Card(Modifier.fillMaxWidth()) {
                androidx.compose.foundation.layout.Column(
                    Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text("Incoming support request")
                    Text("Capabilities: " + request.capabilities.joinToString())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { viewModel.approve(request.sessionId) },
                            enabled = request.capabilities.all(::capabilityEnabled)
                        ) { Text("Approve") }
                        OutlinedButton(onClick = { viewModel.deny(request.sessionId) }) { Text("Deny") }
                    }
                }
            }
        }

        session?.let { current ->
            item {
                Text("Session: " + current.status)
                if (current.status == MediaSessionStatus.APPROVED) {
                    Button(
                        onClick = {
                        pendingStart = current
                        val permissions = buildList {
                            if (MediaCapability.CAMERA in current.capabilities) add(Manifest.permission.CAMERA)
                            if (MediaCapability.MICROPHONE in current.capabilities) add(Manifest.permission.RECORD_AUDIO)
                        }
                        if (permissions.isEmpty()) {
                            if (MediaCapability.SCREEN_SHARING in current.capabilities) projectionLauncher()
                            else { viewModel.startPublishing(current, null); pendingStart = null }
                        } else permissionLauncher.launch(permissions.toTypedArray())
                    },
                        enabled = current.capabilities.all(::capabilityEnabled)
                    ) { Text("Start sharing (visible)") }
                }
                if (device != null && current.status in setOf(MediaSessionStatus.APPROVED, MediaSessionStatus.ACTIVE)) {
                    WebRtcVideoRenderer(viewModel.eglBase(), renderer, Modifier.fillMaxWidth().height(220.dp))
                    // The controller must answer the offer while the session is APPROVED;
                    // waiting for ACTIVE here deadlocks both peers before SDP exchange.
                    LaunchedEffect(current.sessionId, current.offerSdp) {
                        if (!current.offerSdp.isNullOrBlank()) {
                            viewModel.connectViewer(current, renderer)
                        }
                    }
                }
                if (current.status == MediaSessionStatus.REQUESTED || current.status == MediaSessionStatus.APPROVED || current.status == MediaSessionStatus.ACTIVE) {
                    OutlinedButton(onClick = { viewModel.stop(current.sessionId) }) { Text("Stop session") }
                }
            }
        }

        error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
        item {
            OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text("Back to features")
            }
        }
    }
}
