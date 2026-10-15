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
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
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
    private val privacyPrefs by lazy { context.getSharedPreferences("privacy_controls", Context.MODE_PRIVATE) }

    private val signedInUid = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { state ->
            trySend(state.currentUser?.uid.orEmpty())
        }
        auth.addAuthStateListener(listener)
        trySend(auth.currentUser?.uid.orEmpty())
        awaitClose { auth.removeAuthStateListener(listener) }
    }.distinctUntilChanged().stateIn(
        viewModelScope,
        SharingStarted.Eagerly,
        auth.currentUser?.uid.orEmpty()
    )

    val controlledDevice = signedInUid.flatMapLatest { uid ->
        if (uid.isBlank()) flowOf(null) else pairingRepository.observeControlledDevice()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val incoming = signedInUid.flatMapLatest { uid ->
        if (uid.isBlank()) {
            flowOf(emptyList<FileTransferRequest>())
        } else {
            repository.observeIncoming(uid).catch {
                // Clear stale transfer metadata and keep the auth observer alive
                // when Firestore denies access or the network is unavailable.
                emit(emptyList())
            }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _status = MutableStateFlow<String?>(null)
    val status: StateFlow<String?> = _status
    private val pendingTransferPrefs by lazy {
        context.getSharedPreferences("file_transfer_pending", Context.MODE_PRIVATE)
    }
    private var pendingOwnerUid = auth.currentUser?.uid.orEmpty()
    private var pendingTransferId: String? = null
    private var pendingUri: Uri? = null
    private val _hasPendingUpload = MutableStateFlow(false)
    val hasPendingUpload: StateFlow<Boolean> = _hasPendingUpload

    init {
        // Restore the user-selected URI after process death, but never reuse it across accounts.
        val currentUid = auth.currentUser?.uid.orEmpty()
        val savedOwnerUid = pendingTransferPrefs.getString("owner_uid", null)
        val savedTransferId = pendingTransferPrefs.getString("transfer_id", null)
        val savedUri = pendingTransferPrefs.getString("content_uri", null)
        val restoredUri = savedUri?.let { runCatching { Uri.parse(it) }.getOrNull() }
        if (currentUid.isNotBlank() && currentUid == savedOwnerUid &&
            !savedTransferId.isNullOrBlank() && restoredUri != null
        ) {
            pendingTransferId = savedTransferId
            pendingUri = restoredUri
            _hasPendingUpload.value = true
        } else {
            pendingTransferPrefs.edit().clear().apply()
        }

        viewModelScope.launch {
            signedInUid.collect { uid ->
                if (uid != pendingOwnerUid) {
                    pendingOwnerUid = uid
                    pendingTransferId = null
                    pendingUri = null
                    _hasPendingUpload.value = false
                    pendingTransferPrefs.edit().clear().apply()
                    _status.value = null
                }
            }
        }
    }

    fun uploadSelectedFile(uri: Uri) = viewModelScope.launch {
        if (!privacyPrefs.getBoolean("allow_file_transfers", true)) {
            _status.value = "File transfers are disabled in Privacy Controls."
            return@launch
        }
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
        try {
            repository.request(FileTransferRequest(id, sender, receiver, fileName, mime, size, System.currentTimeMillis(), FileTransferRequest.Status.REQUESTED))
        } catch (error: Exception) {
            _status.value = error.message ?: "Could not create transfer request."
            return@launch
        }
        pendingTransferId = id
        pendingUri = uri
        pendingTransferPrefs.edit()
            .putString("owner_uid", sender)
            .putString("transfer_id", id)
            .putString("content_uri", uri.toString())
            .apply()
        _hasPendingUpload.value = true
        _status.value = "Transfer request created. Wait for receiver approval."
    }

    fun approve(transferId: String) = viewModelScope.launch {
        val receiver = auth.currentUser?.uid ?: run { _status.value = "Sign in first."; return@launch }
        val request = runCatching { repository.get(transferId) }
            .getOrElse { _status.value = it.message ?: "Could not load the transfer request."; return@launch }
            ?: run { _status.value = "Transfer request not found."; return@launch }
        if (request.receiverDeviceId != receiver || request.status != FileTransferRequest.Status.REQUESTED) {
            _status.value = "Only the intended receiver can approve a pending transfer."
            return@launch
        }
        if (!privacyPrefs.getBoolean("allow_file_transfers", true)) {
            runCatching { repository.updateStatus(transferId, FileTransferRequest.Status.REJECTED) }
                .onSuccess { _status.value = "File transfers are disabled in Privacy Controls; request rejected." }
                .onFailure { _status.value = it.message ?: "Could not reject the transfer request." }
            return@launch
        }
        runCatching { repository.updateStatus(transferId, FileTransferRequest.Status.APPROVED) }
            .onSuccess { _status.value = "Transfer approved. The sender can now upload the selected file." }
            .onFailure { _status.value = it.message ?: "Could not approve this transfer." }
    }

    fun reject(transferId: String) = viewModelScope.launch {
        val receiver = auth.currentUser?.uid ?: run { _status.value = "Sign in first."; return@launch }
        val request = runCatching { repository.get(transferId) }
            .getOrElse { _status.value = it.message ?: "Could not load the transfer request."; return@launch }
            ?: run { _status.value = "Transfer request not found."; return@launch }
        if (request.receiverDeviceId != receiver || request.status != FileTransferRequest.Status.REQUESTED) {
            _status.value = "Only the intended receiver can reject a pending transfer."
            return@launch
        }
        runCatching { repository.updateStatus(transferId, FileTransferRequest.Status.REJECTED) }
            .onSuccess { _status.value = "Transfer request rejected." }
            .onFailure { _status.value = it.message ?: "Could not reject this transfer." }
    }

    fun download(transferId: String, targetUri: Uri) = viewModelScope.launch {
        if (!privacyPrefs.getBoolean("allow_file_transfers", true)) {
            _status.value = "File transfers are disabled in Privacy Controls."
            return@launch
        }
        val receiver = auth.currentUser?.uid ?: run { _status.value = "Sign in first."; return@launch }
        val request = runCatching { repository.get(transferId) }
            .getOrElse { _status.value = it.message ?: "Could not load the transfer request."; return@launch }
            ?: run { _status.value = "Transfer request not found."; return@launch }
        if (request.receiverDeviceId != receiver || request.status != FileTransferRequest.Status.READY) {
            _status.value = "Only the intended receiver can download a ready transfer."
            return@launch
        }
        val storagePath = request.storagePath ?: run { _status.value = "The uploaded file path is missing."; return@launch }
        if (!storagePath.startsWith("fileTransfers/${request.senderDeviceId}/${request.transferId}/")) {
            _status.value = "The transfer storage path failed validation."
            return@launch
        }
        runCatching { uploader.downloadToUri(storagePath, targetUri) }
            .onSuccess { _status.value = "File downloaded successfully." }
            .onFailure { _status.value = it.message ?: "File download failed." }
    }

    fun uploadApproved() = viewModelScope.launch {
        val id = pendingTransferId ?: run { _status.value = "No pending transfer."; return@launch }
        val uri = pendingUri ?: run { _status.value = "Select the file again."; return@launch }
        if (!privacyPrefs.getBoolean("allow_file_transfers", true)) {
            _status.value = "File transfers are disabled in Privacy Controls."
            return@launch
        }
        val request = repository.get(id) ?: run { _status.value = "Transfer request not found."; return@launch }
        if (request.status != FileTransferRequest.Status.APPROVED) {
            _status.value = "Receiver approval is required first."
            return@launch
        }
        runCatching {
            repository.updateStatus(id, FileTransferRequest.Status.UPLOADING)
            val storagePath = uploader.uploadSelectedFile(id, uri, request.fileName, request.mimeType)
            repository.markReady(id, storagePath)
        }.onSuccess {
            _status.value = "File uploaded. The receiver can now download it."
            _hasPendingUpload.value = false
            pendingTransferId = null
            pendingUri = null
            pendingTransferPrefs.edit().clear().apply()
        }.onFailure {
            runCatching { repository.updateStatus(id, FileTransferRequest.Status.CANCELLED) }
            _hasPendingUpload.value = false
            pendingTransferId = null
            pendingUri = null
            pendingTransferPrefs.edit().clear().apply()
            _status.value = (it.message ?: "File upload failed.") + " Select the file again to start a new request."
        }
    }
}
