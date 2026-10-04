package com.smartcontrol.data.filetransfer

import com.google.firebase.firestore.FirebaseFirestore
import com.smartcontrol.domain.filetransfer.FileTransferRepository
import com.smartcontrol.domain.filetransfer.FileTransferRequest
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

@Singleton
class FirestoreFileTransferRepository @Inject constructor(
    private val firestore: FirebaseFirestore
) : FileTransferRepository {
    override suspend fun request(request: FileTransferRequest) {
        firestore.collection("fileTransfers").document(request.transferId)
            .set(
                mapOf(
                    "senderDeviceId" to request.senderDeviceId,
                    "receiverDeviceId" to request.receiverDeviceId,
                    "fileName" to request.fileName,
                    "mimeType" to request.mimeType,
                    "sizeBytes" to request.sizeBytes,
                    "createdAtEpochMs" to request.createdAtEpochMs,
                    "status" to request.status.name
                )
            ).await()
    }

    override suspend fun updateStatus(
        transferId: String,
        status: FileTransferRequest.Status
    ) {
        firestore.collection("fileTransfers").document(transferId)
            .update("status", status.name).await()
    }

    fun observeIncoming(deviceId: String): Flow<List<FileTransferRequest>> = callbackFlow {
        val registration = firestore.collection("fileTransfers")
            .whereEqualTo("receiverDeviceId", deviceId)
            .whereEqualTo("status", FileTransferRequest.Status.REQUESTED.name)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val items = snapshot?.documents.orEmpty().mapNotNull { doc ->
                    val data = doc.data ?: return@mapNotNull null
                    FileTransferRequest(
                        transferId = doc.id,
                        senderDeviceId = data["senderDeviceId"] as? String ?: return@mapNotNull null,
                        receiverDeviceId = data["receiverDeviceId"] as? String ?: return@mapNotNull null,
                        fileName = data["fileName"] as? String ?: return@mapNotNull null,
                        mimeType = data["mimeType"] as? String,
                        sizeBytes = (data["sizeBytes"] as? Number)?.toLong() ?: -1L,
                        createdAtEpochMs = (data["createdAtEpochMs"] as? Number)?.toLong() ?: 0L,
                        status = FileTransferRequest.Status.REQUESTED
                    )
                }
                trySend(items)
            }
        awaitClose { registration.remove() }
    }
}
