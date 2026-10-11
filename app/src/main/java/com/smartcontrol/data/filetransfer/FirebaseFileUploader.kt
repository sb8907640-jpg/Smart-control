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
        val safeName = fileName.substringAfterLast('/').substringAfterLast('\\')
            .replace(Regex("[\\u0000-\\u001F]"), "_")
            .take(180)
            .ifBlank { "selected-file" }
        val path = "fileTransfers/$uid/$transferId/$safeName"
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

    suspend fun downloadToUri(storagePath: String, targetUri: Uri) {
        require(storagePath.startsWith("fileTransfers/") && !storagePath.contains("..")) {
            "Invalid transfer storage path."
        }
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
