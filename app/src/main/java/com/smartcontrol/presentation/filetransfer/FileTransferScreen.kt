package com.smartcontrol.presentation.filetransfer

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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
    val hasPendingUpload by viewModel.hasPendingUpload.collectAsState()
    val context = LocalContext.current
    var pendingDownloadId by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    it,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            }
            viewModel.uploadSelectedFile(it)
        }
    }
    val createDocument = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val transferId = pendingDownloadId
        pendingDownloadId = null
        if (uri != null && transferId != null) viewModel.download(transferId, uri)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Text("File Transfer", style = MaterialTheme.typography.headlineSmall)
            Text("Choose a file to request a transfer. The receiving device must approve it before upload; only that receiver can download a ready file.")
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
        if (hasPendingUpload) {
            item {
                Button(onClick = viewModel::uploadApproved, modifier = Modifier.fillMaxWidth()) {
                    Text("Upload selected file after approval")
                }
            }
        }
        if (incoming.isNotEmpty()) {
            item { Text("Incoming transfer requests and ready files", style = MaterialTheme.typography.titleMedium) }
        }
        items(incoming, key = { it.transferId }) { request ->
            Card(Modifier.fillMaxWidth()) {
                androidx.compose.foundation.layout.Column(
                    Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(request.fileName, style = MaterialTheme.typography.titleMedium)
                    Text("Size: ${request.sizeBytes} bytes")
                    Text("Sender: ${request.senderDeviceId}")
                    Text("Status: ${request.status.name}")
                    when (request.status) {
                        com.smartcontrol.domain.filetransfer.FileTransferRequest.Status.REQUESTED -> {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = { viewModel.approve(request.transferId) },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Approve")
                                }
                                OutlinedButton(
                                    onClick = { viewModel.reject(request.transferId) },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Reject")
                                }
                            }
                        }
                        com.smartcontrol.domain.filetransfer.FileTransferRequest.Status.READY -> {
                            OutlinedButton(
                                onClick = {
                                    pendingDownloadId = request.transferId
                                    createDocument.launch(request.fileName)
                                }
                            ) {
                                Text("Download file")
                            }
                        }
                        else -> Unit
                    }
                }
            }
        }
        status?.let { message -> item { Text(message) } }
        item {
            OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text("Back")
            }
        }
    }
}
