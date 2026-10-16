package com.smartcontrol.data.filetransfer

import android.content.Context
import android.net.Uri
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.storage.FirebaseStorage
import java.io.File
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.tasks.await

@Singleton
class FirebaseFileUploader @Inject constructor(
    @ApplicationContext private val context: Context,
    private val auth: FirebaseAuth,
    private val storage: FirebaseStorage
) {
    private fun safeFileName(fileName: String): String =
        fileName.substringAfterLast('/').substringAfterLast('\\')
            .replace(Regex("[\\u0000-\\u001F]"), "_")
            .take(180)
            .ifBlank { "selected-file" }
            .let { if (it == "." || it == "..") "selected-file" else it }

    fun storagePathFor(uid: String, transferId: String, fileName: String): String {
        require(uid.isNotBlank() && '/' !in uid) { "Invalid sender UID." }
        require(transferId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "Invalid transfer ID." }
        return "fileTransfers/" + uid + "/" + transferId + "/" + safeFileName(fileName)
    }

    /**
     * Uploads only a file explicitly selected by the device user.
     * No directory scanning or background filesystem access is performed.
     */
    suspend fun uploadSelectedFile(
        transferId: String,
        uri: Uri,
        fileName: String,
        mimeType: String?
    ): String {
        val uid = auth.currentUser?.uid ?: error("Sign in first.")
        val path = storagePathFor(uid, transferId, fileName)
        val ref = storage.reference.child(path)
        context.contentResolver.openInputStream(uri).use { input ->
            requireNotNull(input) { "Selected file could not be opened." }
            val metadata = com.google.firebase.storage.StorageMetadata.Builder()
                .setContentType(mimeType)
                .build()
            ref.putStream(input, metadata).await()
        }
        return path
    }

    suspend fun deleteUploadedFile(storagePath: String) {
        val uid = auth.currentUser?.uid ?: error("Sign in first.")
        val parts = storagePath.split('/')
        require(parts.size == 4 && parts[0] == "fileTransfers" && parts[1] == uid &&
            parts[2].isNotBlank() && parts[3].isNotBlank() && parts.none { it == "." || it == ".." }
        ) { "Invalid transfer storage path." }
        storage.reference.child(storagePath).delete().await()
    }

    suspend fun downloadToUri(storagePath: String, targetUri: Uri) {
        val parts = storagePath.split('/')
        require(parts.size == 4 && parts[0] == "fileTransfers" &&
            parts.all { it.isNotBlank() && it != "." && it != ".." }
        ) { "Invalid transfer storage path." }
        val tempFile = File.createTempFile("family-suraksha-transfer-", ".bin", context.cacheDir)
        try {
            storage.reference.child(storagePath).getFile(tempFile).await()
            val output = context.contentResolver.openOutputStream(targetUri)
                ?: error("The selected save location could not be opened.")
            output.use { destination ->
                tempFile.inputStream().use { source -> source.copyTo(destination) }
            }
        } finally {
            tempFile.delete()
        }
    }
}
