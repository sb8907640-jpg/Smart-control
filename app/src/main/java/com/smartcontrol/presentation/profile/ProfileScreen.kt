package com.smartcontrol.presentation.profile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.smartcontrol.domain.media.MediaSessionStatus
import com.smartcontrol.presentation.media.MediaSessionViewModel

@Composable
fun ProfileScreen(
    onBack: () -> Unit,
    onOwnerAdmin: () -> Unit,
    onEmergencyContacts: () -> Unit,
    viewModel: MediaSessionViewModel = hiltViewModel()
) {
    val session by viewModel.selectedSession.collectAsState()

    Column(
        modifier = Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Profile", style = MaterialTheme.typography.headlineSmall)
        Text("Remote support status and safety controls.")

        val active = session?.status == MediaSessionStatus.ACTIVE
        if (active && session != null) {
            Card(Modifier.fillMaxWidth()) {
                Column(
                    Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text("Syncing Device", style = MaterialTheme.typography.titleMedium)
                    Text("A remote support session is currently active.")
                    Button(
                        onClick = { viewModel.stop(session!!.sessionId) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                            contentColor = MaterialTheme.colorScheme.onError
                        )
                    ) {
                        Text("Stop Sync")
                    }
                }
            }
        } else {
            Text("No active remote support session.")
        }

        OutlinedButton(onClick = onOwnerAdmin, modifier = Modifier.fillMaxWidth()) {
            Text("Owner / Admin Settings")
        }
        OutlinedButton(onClick = onEmergencyContacts, modifier = Modifier.fillMaxWidth()) {
            Text("Emergency Contacts")
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }
    }
}
