package com.smartcontrol.presentation.feature

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.smartcontrol.domain.spec.FeatureCatalog

@Composable
fun FeatureCenterScreen(onBack: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("19 Feature Center", style = MaterialTheme.typography.headlineSmall)
        Text("Every sensitive feature remains subject to Android permissions and visible user consent.")
        LazyColumn(
            Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(FeatureCatalog.all) { spec ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(spec.displayName, style = MaterialTheme.typography.titleMedium)
                        Text("Consent: " + spec.consent.joinToString())
                        Text("Online: " + if (spec.online) "Yes" else "No" + " • Offline: " + if (spec.offline) "Yes" else "No")
                        if (spec.visibleWhileActive) Text("Visible while active: Yes")
                    }
                }
            }
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
