package com.smartcontrol.presentation.profile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.domain.media.MediaSessionStatus
import kotlinx.coroutines.tasks.await
import com.smartcontrol.presentation.media.MediaSessionViewModel

@Composable
fun ProfileScreen(
    onBack: () -> Unit,
    onOwnerAdmin: () -> Unit,
    onEmergencyContacts: () -> Unit,
    onAuditLog: () -> Unit,
    onPrivacyControls: () -> Unit,
    viewModel: MediaSessionViewModel = hiltViewModel()
) {
    val session by viewModel.selectedSession.collectAsState()
    var isAdmin by remember { mutableStateOf(false) }\n    LaunchedEffect(Unit) {\n        isAdmin = runCatching {\n            FirebaseAuth.getInstance().currentUser?.getIdToken(false)?.await()?.claims?.get("admin") == true\n        }.getOrDefault(false)\n    }\n    Column(
        Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Profile", style = MaterialTheme.typography.headlineSmall)
        Text("Remote support status and safety controls.")
        val active = session?.status == MediaSessionStatus.ACTIVE
        if (active && session != null) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Syncing Device", style = MaterialTheme.typography.titleMedium)
                    Text("A remote support session is currently active.")
                    Button(
                        onClick = { viewModel.stop(session!!.sessionId) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                            contentColor = MaterialTheme.colorScheme.onError
                        )
                    ) { Text("Stop Sync") }
                }
            }
        } else {
            Text("No active remote support session.")
        }
        if (isAdmin) {\n            OutlinedButton(onClick = onOwnerAdmin, modifier = Modifier.fillMaxWidth()) { Text("Owner / Admin Settings") }\n        }
        OutlinedButton(onClick = onEmergencyContacts, modifier = Modifier.fillMaxWidth()) { Text("Emergency Contacts") }
        OutlinedButton(onClick = onAuditLog, modifier = Modifier.fillMaxWidth()) { Text("Consent Audit Log") }
        OutlinedButton(onClick = onPrivacyControls, modifier = Modifier.fillMaxWidth()) { Text("Privacy Controls") }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
