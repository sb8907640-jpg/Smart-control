package com.smartcontrol.data.media

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.smartcontrol.domain.media.*
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

@Singleton
class FirestoreMediaSignalingRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore
) : MediaSignalingRepository {
    private fun ref(id: String) = db.collection("mediaSessions").document(id)

    private fun mapSession(id: String, s: com.google.firebase.firestore.DocumentSnapshot) = MediaSession(
        id,
        s.getString("controllerUid").orEmpty(),
        s.getString("targetDeviceId").orEmpty(),
        (s.get("capabilities") as? List<*>)?.mapNotNull { it as? String }
            ?.mapNotNull { runCatching { MediaCapability.valueOf(it) }.getOrNull() }?.toSet() ?: emptySet(),
        s.getString("status")?.let { runCatching { MediaSessionStatus.valueOf(it) }.getOrNull() }
            ?: MediaSessionStatus.REQUESTED,
        s.getLong("createdAt") ?: 0L, s.getString("offerSdp"), s.getString("answerSdp")
    )

    override suspend fun createSession(sessionId: String, targetDeviceId: String, capabilities: Set<MediaCapability>): Result<MediaSession> = runCatching {
        val controllerUid = auth.currentUser?.uid ?: error("Sign in first")
        val now = System.currentTimeMillis()
        ref(sessionId).set(mapOf(
            "controllerUid" to controllerUid,
            "targetDeviceId" to targetDeviceId,
            "capabilities" to capabilities.map { it.name },
            "status" to MediaSessionStatus.REQUESTED.name,
            "createdAt" to now
        )).await()
        MediaSession(sessionId, controllerUid, targetDeviceId, capabilities, MediaSessionStatus.REQUESTED, now)
    }

    override fun observeSession(sessionId: String): Flow<MediaSession?> = callbackFlow {
        val registration = ref(sessionId).addSnapshotListener { s, e ->
            if (e != null) close(e) else trySend(if (s == null || !s.exists()) null else mapSession(sessionId, s))
        }
        awaitClose { registration.remove() }
    }

    override fun observePendingSessionsForDevice(): Flow<List<MediaSession>> = callbackFlow {
        val uid = auth.currentUser?.uid ?: run { trySend(emptyList()); close(); return@callbackFlow }
        val registration = db.collection("mediaSessions")
            .whereEqualTo("targetDeviceId", uid)
            .whereEqualTo("status", MediaSessionStatus.REQUESTED.name)
            .addSnapshotListener { s, e ->
                if (e != null) close(e) else trySend(s?.documents?.map { mapSession(it.id, it) }.orEmpty())
            }
        awaitClose { registration.remove() }
    }

    override fun observeRemoteIceCandidates(sessionId: String): Flow<IceCandidateModel> = callbackFlow {
        val registration = ref(sessionId).collection("iceCandidates").addSnapshotListener { s, e ->
            if (e != null) close(e)
            s?.documentChanges?.filter { it.type.name == "ADDED" }?.forEach { c ->
                trySend(IceCandidateModel(
                    c.document.getString("candidate").orEmpty(),
                    c.document.getString("sdpMid"),
                    c.document.getLong("sdpMLineIndex")?.toInt()
                ))
            }
        }
        awaitClose { registration.remove() }
    }

    override suspend fun approveSession(sessionId: String) = transition(sessionId, MediaSessionStatus.REQUESTED, MediaSessionStatus.APPROVED)
    override suspend fun denySession(sessionId: String) = transition(sessionId, MediaSessionStatus.REQUESTED, MediaSessionStatus.STOPPED)

    private suspend fun transition(id: String, expected: MediaSessionStatus, next: MediaSessionStatus): Result<Unit> = runCatching {
        db.runTransaction { tx ->
            val r = ref(id); val s = tx.get(r)
            require(s.getString("status") == expected.name) { "Session is no longer awaiting this action" }
            tx.update(r, "status", next.name)
        }.await()
    }.map { Unit }

    override suspend fun writeOffer(sessionId: String, sdp: String) = update(sessionId, "offerSdp", sdp)
    override suspend fun writeAnswer(sessionId: String, sdp: String) = update(sessionId, "answerSdp", sdp)

    private suspend fun update(id: String, field: String, value: String): Result<Unit> = runCatching {
        ref(id).update(field, value).await()
    }.map { Unit }

    override suspend fun addLocalIceCandidate(sessionId: String, candidate: IceCandidateModel): Result<Unit> = runCatching {
        ref(sessionId).collection("iceCandidates").add(mapOf(
            "candidate" to candidate.candidate, "sdpMid" to candidate.sdpMid, "sdpMLineIndex" to candidate.sdpMLineIndex
        )).await()
    }.map { Unit }

    override suspend fun markActive(sessionId: String) = update(sessionId, "status", MediaSessionStatus.ACTIVE.name)
    override suspend fun stopSession(sessionId: String) = update(sessionId, "status", MediaSessionStatus.STOPPED.name)
}
