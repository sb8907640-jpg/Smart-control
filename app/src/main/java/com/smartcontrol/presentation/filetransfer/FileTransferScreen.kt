package com.smartcontrol.presentation.filetransfer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun FileTransferScreen(onBack: () -> Unit, viewModel: FileTransferViewModel = hiltViewModel()) {
    val device by viewModel.controlledDevice.collectAsState()
    val incoming by viewModel.incoming.collectAsState()
    val status by viewModel.status.collectAsState()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(viewModel::uploadSelectedFile)
    }
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("File Transfer", style = MaterialTheme.typography.headlineSmall)
        Text("Transfers require receiver approval. Files are selected only through Android's file picker.")
        Text(device?.let { "Target device: ${it.deviceUid}" } ?: "Pair a client device first.")
        Button({ picker.launch(arrayOf("*/*")) }, enabled = device != null, modifier = Modifier.fillMaxWidth()) {
            Text("Choose file and request transfer")
        }
        Button(onClick = viewModel::uploadApproved, modifier = Modifier.fillMaxWidth()) {
            Text("Upload after approval")
        }
        if (incoming.isNotEmpty()) {
            Text("Incoming transfer requests", style = MaterialTheme.typography.titleMedium)
            incoming.forEach { request ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(request.fileName)
                        Text("Size: ${request.sizeBytes} bytes")
                        Button(onClick = { viewModel.approve(request.transferId) }) {
                            Text("Approve transfer")
                        }
                    }
                }
            }
        }
        status?.let { Text(it) }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
