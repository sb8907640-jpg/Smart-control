package com.smartcontrol.presentation.pairing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun PairingScreen(
    onBack: () -> Unit,
    viewModel: PairingViewModel = hiltViewModel()
) {
    val pairing by viewModel.pairing.collectAsState()
    val state by viewModel.state.collectAsState()
    var token by remember { mutableStateOf("") }
    val context = LocalContext.current

    Column(
        modifier = Modifier.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Device Pairing", style = MaterialTheme.typography.headlineSmall)
        Text("Pairing is explicit. A temporary token is created on the device and entered on the controller.")

        if (pairing != null) {
            Text("Paired controller: " + pairing!!.controllerUid)
            Button(onClick = viewModel::unpair, modifier = Modifier.fillMaxWidth()) {
                Text("Unpair device")
            }
        } else {
            Button(
                onClick = viewModel::generateCode,
                enabled = !state.busy,
                modifier = Modifier.fillMaxWidth()
            ) { Text("Create 10-minute pairing token") }

            state.code?.let {
                Text("Share this temporary token with the intended controller:")
                Text(it.token)
                Button(onClick = {
                    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, "Smart Control pairing token: ${it.token}")
                    }, "Share pairing token"))
                }, modifier = Modifier.fillMaxWidth()) { Text("Share token") }
            }

            OutlinedTextField(
                value = token,
                onValueChange = { token = it },
                label = { Text("Pairing token") },
                modifier = Modifier.fillMaxWidth()
            )
            Button(
                onClick = { viewModel.claimCode(token) },
                enabled = token.isNotBlank() && !state.busy,
                modifier = Modifier.fillMaxWidth()
            ) { Text("Pair this controller") }
        }

        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
