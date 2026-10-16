package com.smartcontrol.presentation.consent

import android.content.Context
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

const val CURRENT_LEGAL_CONSENT_VERSION = 1

@Composable
fun ConsentScreen(context: Context, onAccepted: () -> Unit) {
    var deviceOwnerConsent by remember { mutableStateOf(false) }
    var privacyConsent by remember { mutableStateOf(false) }
    var eulaConsent by remember { mutableStateOf(false) }
    var saveFailed by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Legal & Privacy Consent", style = MaterialTheme.typography.headlineSmall)
        Text("Smart Control uses explicit consent for remote support, camera, microphone, screen sharing, location and file transfer.")
        Text("The app stays visible while sensitive capabilities are active. Android system permission dialogs remain under the user's control.")
        Text("If the device user is under 18, a parent or guardian should approve use of family-safety features.")
        Text("Review the applicable Terms, Privacy Policy and EULA supplied by the service operator before accepting. Official document links are not configured in this build.")
        Text("Acceptance is saved on this device before sign-in, then synchronized to the server after authentication. Protected features stay locked until the server confirms the record.")

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("I am the device owner or have permission to use this app.")
            Checkbox(checked = deviceOwnerConsent, onCheckedChange = { deviceOwnerConsent = it })
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("I understand the privacy and consent controls.")
            Checkbox(checked = privacyConsent, onCheckedChange = { privacyConsent = it })
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("I accept the Terms, Privacy Policy and EULA.")
            Checkbox(checked = eulaConsent, onCheckedChange = { eulaConsent = it })
        }

        if (saveFailed) {
            Text("Consent could not be saved. Please try again before continuing.", color = MaterialTheme.colorScheme.error)
        }

        Button(
            onClick = {
                val saved = context.getSharedPreferences("legal_consent", Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean("accepted", true)
                    .putInt("accepted_version", CURRENT_LEGAL_CONSENT_VERSION)
                    .putLong("accepted_at_epoch_ms", System.currentTimeMillis())
                    .putBoolean("device_owner_consent", deviceOwnerConsent)
                    .putBoolean("privacy_consent", privacyConsent)
                    .putBoolean("eula_consent", eulaConsent)
                    .commit()
                saveFailed = !saved
                if (saved) onAccepted()
            },
            enabled = deviceOwnerConsent && privacyConsent && eulaConsent,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Accept & Continue") }
    }
}
