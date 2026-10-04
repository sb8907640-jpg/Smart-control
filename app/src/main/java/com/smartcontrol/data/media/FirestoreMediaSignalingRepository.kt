package com.smartcontrol.data.media

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.smartcontrol.domain.media.IceCandidateModel
import com.smartcontrol.domain.media.MediaCapability
import com.smartcontrol.domain.media.MediaSession
import com.smartcontrol.domain.media.MediaSessionStatus
import com.smartcontrol.domain.media.MediaSignalingRepository
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
    private fun sessionRef(id: String) = db.collection("mediaSessions").document(id)

    override suspend fun createSession(
        sessionId: String,
        targetDeviceId: String,
        capabilities: Set<MediaCapability>
    ): Result<MediaSession> = runCatching {
        val controllerUid = auth.currentUser?.uid ?: error("Sign in first")
        val now = System.currentTimeMillis()
        sessionRef(sessionId).set(
            mapOf(
                "controllerUid" to controllerUid,
                "targetDeviceId" to targetDeviceId,
                "capabilities" to capabilities.map { it.name },
                "status" to MediaSessionStatus.REQUESTED.name,
                "createdAt" to now
            )
        ).await()
        MediaSession(sessionId, controllerUid, targetDeviceId, capabilities, MediaSessionStatus.REQUESTED, now)
    }

    override fun observeSession(sessionId: String): Flow<MediaSession?> = callbackFlow {
        val registration: ListenerRegistration =
            sessionRef(sessionId).addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                if (snapshot == null || !snapshot.exists()) {
                    trySend(null)
                    return@addSnapshotListener
                }
                val caps = (snapshot.get("capabilities") as? List<*>)
                    ?.mapNotNull { it as? String }
                    ?.mapNotNull { runCatching { MediaCapability.valueOf(it) }.getOrNull() }
                    ?.toSet()
                    ?: emptySet()
                val status = snapshot.getString("status")
                    ?.let { runCatching { MediaSessionStatus.valueOf(it) }.getOrNull() }
                    ?: MediaSessionStatus.REQUESTED
                trySend(
                    MediaSession(
                        sessionId = sessionId,
                        controllerUid = snapshot.getString("controllerUid").orEmpty(),
                        targetDeviceId = snapshot.getString("targetDeviceId").orEmpty(),
                        capabilities = caps,
                        status = status,
                        createdAtEpochMs = snapshot.getLong("createdAt") ?: 0L,
                        offerSdp = snapshot.getString("offerSdp"),
                        answerSdp = snapshot.getString("answerSdp")
                    )
                )
            }
        awaitClose { registration.remove() }
    }

    override fun observeRemoteIceCandidates(sessionId: String): Flow<IceCandidateModel> = callbackFlow {
        val registration = sessionRef(sessionId).collection("iceCandidates")
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                snapshot?.documentChanges
                    ?.filter { it.type.name == "ADDED" }
                    ?.forEach { change ->
                        val data = change.document
                        trySend(
                            IceCandidateModel(
                                candidate = data.getString("candidate").orEmpty(),
                                sdpMid = data.getString("sdpMid"),
                                sdpMLineIndex = data.getLong("sdpMLineIndex")?.toInt()
                            )
                        )
                    }
            }
        awaitClose { registration.remove() }
    }

    override suspend fun writeOffer(sessionId: String, sdp: String): Result<Unit> = writeDescription("offerSdp", sessionId, sdp)
    override suspend fun writeAnswer(sessionId: String, sdp: String): Result<Unit> = writeDescription("answerSdp", sessionId, sdp)

    private suspend fun writeDescription(field: String, sessionId: String, sdp: String): Result<Unit> = runCatching {
        sessionRef(sessionId).update(field, sdp).await()
    }

    override suspend fun addLocalIceCandidate(sessionId: String, candidate: IceCandidateModel): Result<Unit> = runCatching {
        sessionRef(sessionId).collection("iceCandidates").add(
            mapOf(
                "candidate" to candidate.candidate,
                "sdpMid" to candidate.sdpMid,
                "sdpMLineIndex" to candidate.sdpMLineIndex
            )
        ).await()
    }.map { Unit }

    override suspend fun markActive(sessionId: String): Result<Unit> = runCatching {
        sessionRef(sessionId).update("status", MediaSessionStatus.ACTIVE.name).await()
    }

    override suspend fun stopSession(sessionId: String): Result<Unit> = runCatching {
        sessionRef(sessionId).update("status", MediaSessionStatus.STOPPED.name).await()
    }
}
