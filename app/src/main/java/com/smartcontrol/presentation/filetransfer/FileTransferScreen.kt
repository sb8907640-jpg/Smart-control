package com.smartcontrol.presentation.filetransfer

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun FileTransferScreen(
    onBack: () -> Unit,
    viewModel: FileTransferViewModel = hiltViewModel()
) {
    val device by viewModel.controlledDevice.collectAsState()
    val incoming by viewModel.incoming.collectAsState()
    val status by viewModel.status.collectAsState()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(viewModel::uploadSelectedFile)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Text("File Transfer", style = MaterialTheme.typography.headlineSmall)
            Text("Transfers require receiver approval. Files are selected only through Android's file picker.")
            Text(device?.let { "Target device: ${it.deviceUid}" } ?: "Pair a client device first.")
        }
        item {
            Button(
                onClick = { picker.launch(arrayOf("*/*")) },
                enabled = device != null,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Choose file and request transfer")
            }
        }
        item {
            Button(onClick = viewModel::uploadApproved, modifier = Modifier.fillMaxWidth()) {
                Text("Upload after approval")
            }
        }
        if (incoming.isNotEmpty()) {
            item { Text("Incoming transfer requests", style = MaterialTheme.typography.titleMedium) }
        }
        items(incoming, key = { it.transferId }) { request ->
            Card(Modifier.fillMaxWidth()) {
                androidx.compose.foundation.layout.Column(
                    Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(request.fileName)
                    Text("Size: ${request.sizeBytes} bytes")
                    Text("Sender: ${request.senderDeviceId}")
                    Button(onClick = { viewModel.approve(request.transferId) }) {
                        Text("Approve transfer")
                    }
                }
            }
        }
        status?.let { message ->
            item { Text(message) }
        }
        item {
            OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text("Back")
            }
        }
    }
}
