package com.smartcontrol.data.filetransfer

import com.google.firebase.firestore.FirebaseFirestore
import com.smartcontrol.domain.filetransfer.FileTransferRepository
import com.smartcontrol.domain.filetransfer.FileTransferRequest
import javax.inject.Inject
import javax.inject.Singleton
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
}
