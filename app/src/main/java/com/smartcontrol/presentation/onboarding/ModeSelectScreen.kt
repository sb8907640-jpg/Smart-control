package com.smartcontrol.presentation.onboarding

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

enum class AppMode { CONTROLLER, CLIENT }

@Composable
fun ModeSelectScreen(context: Context, onSelected: (AppMode) -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Select Mode", style = MaterialTheme.typography.headlineSmall)
        Text("Choose how this installation will participate in an explicit, consent-based pairing.")

        Button(
            onClick = {
                context.getSharedPreferences("smart_control_mode", Context.MODE_PRIVATE)
                    .edit().putString("mode", AppMode.CONTROLLER.name).apply()
                onSelected(AppMode.CONTROLLER)
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Controller")
        }
        Text("Controller creates and manages an explicit pairing request.")

        OutlinedButton(
            onClick = {
                context.getSharedPreferences("smart_control_mode", Context.MODE_PRIVATE)
                    .edit().putString("mode", AppMode.CLIENT.name).apply()
                onSelected(AppMode.CLIENT)
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Client")
        }
        Text("Client accepts an explicit pairing token and retains Stop/Disconnect controls.")
    }
}
