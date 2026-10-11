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

    suspend fun get(transferId: String): FileTransferRequest? {
        val data = firestore.collection("fileTransfers").document(transferId).get().await().data ?: return null
        return FileTransferRequest(
            transferId = transferId,
            senderDeviceId = data["senderDeviceId"] as? String ?: return null,
            receiverDeviceId = data["receiverDeviceId"] as? String ?: return null,
            fileName = data["fileName"] as? String ?: return null,
            mimeType = data["mimeType"] as? String,
            sizeBytes = (data["sizeBytes"] as? Number)?.toLong() ?: -1L,
            createdAtEpochMs = (data["createdAtEpochMs"] as? Number)?.toLong() ?: 0L,
            status = runCatching { FileTransferRequest.Status.valueOf(data["status"] as? String ?: "") }
                .getOrElse { FileTransferRequest.Status.CANCELLED },
            storagePath = data["storagePath"] as? String
        )
    }

    suspend fun markReady(transferId: String, storagePath: String) {
        firestore.collection("fileTransfers").document(transferId)
            .update(
                mapOf(
                    "status" to FileTransferRequest.Status.READY.name,
                    "storagePath" to storagePath,
                    "updatedAt" to System.currentTimeMillis()
                )
            ).await()
    }

    fun observeIncoming(deviceId: String): Flow<List<FileTransferRequest>> = callbackFlow {
        val registration = firestore.collection("fileTransfers")
            .whereEqualTo("receiverDeviceId", deviceId)
            .whereIn("status", listOf(FileTransferRequest.Status.REQUESTED.name, FileTransferRequest.Status.READY.name))
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
                        status = runCatching { FileTransferRequest.Status.valueOf(data["status"] as? String ?: "") }
                            .getOrElse { FileTransferRequest.Status.CANCELLED },
                        storagePath = data["storagePath"] as? String
                    )
                }
                trySend(items)
            }
        awaitClose { registration.remove() }
    }
}
