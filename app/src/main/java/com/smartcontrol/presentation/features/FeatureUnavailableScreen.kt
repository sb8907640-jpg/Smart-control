package com.smartcontrol.presentation.features

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun FeatureUnavailableScreen(
    featureName: String,
    loading: Boolean,
    onBack: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            if (loading) "Loading owner settings" else "Feature unavailable",
            style = MaterialTheme.typography.headlineSmall
        )
        Text(
            if (loading) {
                "Family Suraksha is checking the current owner feature policy. Please wait before opening this feature."
            } else {
                "$featureName is disabled by the owner. Ask the owner to enable it in Owner / Admin Settings."
            }
        )
        Button(onClick = onBack) { Text("Back to features") }
    }
}
