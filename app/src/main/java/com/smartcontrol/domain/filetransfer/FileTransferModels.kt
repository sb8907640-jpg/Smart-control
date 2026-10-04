package com.smartcontrol.domain.filetransfer

data class FileTransferRequest(
    val transferId: String,
    val senderDeviceId: String,
    val receiverDeviceId: String,
    val fileName: String,
    val mimeType: String?,
    val sizeBytes: Long,
    val createdAtEpochMs: Long,
    val status: Status
) {
    enum class Status { REQUESTED, APPROVED, UPLOADING, READY, REJECTED, CANCELLED }
}

interface FileTransferRepository {
    suspend fun request(request: FileTransferRequest)
    suspend fun updateStatus(transferId: String, status: FileTransferRequest.Status)
}
