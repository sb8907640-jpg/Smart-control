package com.smartcontrol.presentation.filetransfer
import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.data.filetransfer.FirebaseFileUploader
import com.smartcontrol.data.filetransfer.FirestoreFileTransferRepository
import com.smartcontrol.domain.filetransfer.FileTransferRequest
import com.smartcontrol.domain.pairing.PairingRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class FileTransferViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val auth: FirebaseAuth,
    pairingRepository: PairingRepository,
    private val repository: FirestoreFileTransferRepository,
    private val uploader: FirebaseFileUploader
) : ViewModel() {
    val controlledDevice = pairingRepository.observeControlledDevice()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    private val _status = MutableStateFlow<String?>(null)
    val status: StateFlow<String?> = _status

    fun uploadSelectedFile(uri: Uri) = viewModelScope.launch {
        val sender = auth.currentUser?.uid ?: run { _status.value = "Sign in first."; return@launch }
        val receiver = controlledDevice.value?.deviceUid ?: run { _status.value = "Pair a client device first."; return@launch }
        val resolver = context.contentResolver
        val fileName = resolver.query(uri, null, null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (cursor.moveToFirst() && index >= 0) cursor.getString(index) else null
        } ?: "selected-file"
        val mime = resolver.getType(uri)
        val size = resolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
        val id = UUID.randomUUID().toString()
        repository.request(FileTransferRequest(id, sender, receiver, fileName, mime, size, System.currentTimeMillis(), FileTransferRequest.Status.REQUESTED))
        _status.value = "Transfer request created."
        runCatching {
            repository.updateStatus(id, FileTransferRequest.Status.UPLOADING)
            uploader.uploadSelectedFile(id, uri, fileName, mime)
            repository.updateStatus(id, FileTransferRequest.Status.READY)
        }.onSuccess { _status.value = "File uploaded and marked ready." }
         .onFailure {
            repository.updateStatus(id, FileTransferRequest.Status.CANCELLED)
            _status.value = it.message ?: "File upload failed."
         }
    }
}
