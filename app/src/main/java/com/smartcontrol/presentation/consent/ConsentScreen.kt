package com.smartcontrol.presentation.consent

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun ConsentScreen(context: Context, onAccepted: () -> Unit) {
    var deviceOwnerConsent by remember { mutableStateOf(false) }
    var privacyConsent by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Legal & Privacy Consent", style = MaterialTheme.typography.headlineSmall)
        Text("Smart Control uses explicit consent for remote support, camera, microphone, screen sharing, location and file transfer.")
        Text("The app stays visible while sensitive capabilities are active. Android system permission dialogs remain under the user's control.")
        Text("If the device user is under 18, a parent or guardian should approve use of family-safety features.")

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("I am the device owner or have permission to use this app.")
            Checkbox(checked = deviceOwnerConsent, onCheckedChange = { deviceOwnerConsent = it })
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("I understand the privacy and consent controls.")
            Checkbox(checked = privacyConsent, onCheckedChange = { privacyConsent = it })
        }

        Button(
            onClick = {
                context.getSharedPreferences("legal_consent", Context.MODE_PRIVATE)
                    .edit().putBoolean("accepted", true).apply()
                onAccepted()
            },
            enabled = deviceOwnerConsent && privacyConsent,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Accept & Continue") }
    }
}
