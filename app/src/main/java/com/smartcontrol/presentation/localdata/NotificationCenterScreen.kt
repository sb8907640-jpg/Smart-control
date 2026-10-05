package com.smartcontrol.presentation.localdata

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.smartcontrol.service.NotificationAccessService

@Composable
fun NotificationCenterScreen(onBack: () -> Unit) {
    val notifications by NotificationAccessService.recentNotifications.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current
    val enabled = remember { mutableStateOf(isNotificationAccessEnabled(context)) }

    Column(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Notifications", style = MaterialTheme.typography.headlineSmall)
        Text("Local-only notification viewer. Notification Access must be enabled by the device user in Android Settings.")
        Button(
            onClick = {
                context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                enabled.value = isNotificationAccessEnabled(context)
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (enabled.value) "Notification Access enabled" else "Open Notification Access settings")
        }
        Text("Status: " + if (enabled.value) "Enabled" else "Not enabled")
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(notifications) { item ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(item.packageName, style = MaterialTheme.typography.labelMedium)
                        if (item.title.isNotBlank()) Text(item.title, style = MaterialTheme.typography.titleMedium)
                        if (item.text.isNotBlank()) Text(item.text)
                    }
                }
            }
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}

private fun isNotificationAccessEnabled(context: Context): Boolean =
    android.service.notification.NotificationListenerService::class.java.let {
        Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
            ?.contains(context.packageName) == true
    }
