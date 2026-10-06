package com.smartcontrol.presentation.onboarding

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun AgeVerificationScreen(context: Context, onVerified: () -> Unit) {
    var adult by remember { mutableStateOf(false) }
    var guardian by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Age Verification", style = MaterialTheme.typography.headlineSmall)
        Text("Confirm the age/guardian requirement before using consent-based device linking.")

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("I am 18 or older.")
            Checkbox(adult, { adult = it; if (it) guardian = false })
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("I have parent/guardian consent.")
            Checkbox(guardian, { guardian = it; if (it) adult = false })
        }

        Text(
            "Choose one option. Guardian consent does not remove Android system permission or device-user consent requirements."
        )

        Button(
            onClick = {
                context.getSharedPreferences("legal_consent", Context.MODE_PRIVATE)
                    .edit().putBoolean("age_verified", true).apply()
                onVerified()
            },
            enabled = adult || guardian,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Continue") }
    }
}
