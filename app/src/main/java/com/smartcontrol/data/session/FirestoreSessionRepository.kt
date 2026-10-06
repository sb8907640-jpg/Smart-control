package com.smartcontrol.data.session

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import com.smartcontrol.domain.session.*
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

@Singleton
class FirestoreSessionRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore
) : SessionRepository {

    override val pendingRequests: Flow<List<SessionRequest>> = callbackFlow {
        val uid = auth.currentUser?.uid ?: run { trySend(emptyList()); close(); return@callbackFlow }
        val listener: ListenerRegistration = db.collection("mediaSessions")
            .whereEqualTo("targetDeviceId", uid)
            .whereEqualTo("status", "REQUESTED")
            .addSnapshotListener { snapshot, error ->
                if (error != null) { close(error); return@addSnapshotListener }
                trySend(snapshot?.documents?.mapNotNull(::toRequest).orEmpty())
            }
        awaitClose { listener.remove() }
    }

    override val activeSession: Flow<RemoteSession?> = callbackFlow {
        val uid = auth.currentUser?.uid ?: run { trySend(null); close(); return@callbackFlow }
        val listener = db.collection("mediaSessions")
            .whereEqualTo("targetDeviceId", uid)
            .whereIn("status", listOf("APPROVED", "ACTIVE"))
            .limit(1)
            .addSnapshotListener { snapshot, error ->
                if (error != null) { close(error); return@addSnapshotListener }
                trySend(snapshot?.documents?.firstOrNull()?.let(::toRemoteSession))
            }
        awaitClose { listener.remove() }
    }

    override suspend fun requestSession(request: SessionRequest) {
        val uid = auth.currentUser?.uid ?: error("Sign in first")
        require(uid == request.requesterId) { "Requester mismatch" }
        db.collection("mediaSessions").document(request.sessionId).set(
            mapOf(
                "controllerUid" to request.requesterId,
                "targetDeviceId" to request.targetDeviceId,
                "capabilities" to request.capabilities.map { it.name },
                "reason" to request.reason.take(500),
                "createdAt" to request.createdAtEpochMs,
                "status" to SessionStatus.REQUESTED.name
            )
        ).await()
    }

    override suspend fun approve(requestId: String) = setStatus(requestId, SessionStatus.APPROVED)
    override suspend fun deny(requestId: String) = setStatus(requestId, SessionStatus.STOPPED)

    override suspend fun stopActiveSession() {
        val uid = auth.currentUser?.uid ?: return
        val snapshot = db.collection("mediaSessions")
            .whereEqualTo("targetDeviceId", uid)
            .whereIn("status", listOf("APPROVED", "ACTIVE"))
            .get().await()
        val batch = db.batch()
        snapshot.documents.forEach { batch.update(it.reference, mapOf("status" to SessionStatus.STOPPED.name)) }
        if (!snapshot.isEmpty) batch.commit().await()
    }

    private suspend fun setStatus(sessionId: String, status: SessionStatus) {
        val uid = auth.currentUser?.uid ?: error("Sign in first")
        val ref = db.collection("mediaSessions").document(sessionId)
        val snapshot = ref.get().await()
        require(snapshot.exists()) { "Session not found" }
        require(snapshot.getString("targetDeviceId") == uid) { "Only the paired device can change approval" }
        ref.update("status", status.name).await()
    }

    private fun toRequest(doc: com.google.firebase.firestore.DocumentSnapshot): SessionRequest? {
        val requester = doc.getString("controllerUid") ?: return null
        val target = doc.getString("targetDeviceId") ?: return null
        val capabilities = doc.get("capabilities") as? List<*> ?: emptyList<Any>()
        return SessionRequest(
            sessionId = doc.id,
            requesterId = requester,
            targetDeviceId = target,
            capabilities = capabilities.mapNotNull { runCatching { SessionCapability.valueOf(it.toString()) }.getOrNull() }.toSet(),
            reason = doc.getString("reason").orEmpty(),
            createdAtEpochMs = doc.getLong("createdAt") ?: 0L
        )
    }

    private fun toRemoteSession(doc: com.google.firebase.firestore.DocumentSnapshot): RemoteSession? {
        val request = toRequest(doc) ?: return null
        val status = runCatching { SessionStatus.valueOf(doc.getString("status").orEmpty()) }.getOrNull()
            ?: return null
        return RemoteSession(request, status)
    }
}
