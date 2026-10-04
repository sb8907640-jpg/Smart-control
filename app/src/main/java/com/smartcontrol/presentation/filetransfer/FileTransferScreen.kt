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
    val status by viewModel.status.collectAsState()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(viewModel::uploadSelectedFile)
    }
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("File Transfer", style = MaterialTheme.typography.headlineSmall)
        Text("Only a file explicitly chosen through Android's file picker can be uploaded.")
        Text(device?.let { "Target device: ${it.deviceUid}" } ?: "Pair a client device first.")
        Button({ picker.launch(arrayOf("*/*")) }, enabled = device != null, modifier = Modifier.fillMaxWidth()) {
            Text("Choose file and request transfer")
        }
        status?.let { Text(it) }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
