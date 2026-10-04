package com.smartcontrol.data.audit

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.smartcontrol.domain.audit.AuditRepository
import com.smartcontrol.domain.audit.ConsentAuditEvent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.tasks.await

@Singleton
class FirestoreAuditRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore
) : AuditRepository {
    override suspend fun append(event: ConsentAuditEvent): Result<Unit> = runCatching {
        val uid = auth.currentUser?.uid ?: error("Sign in first.")
        require(uid == event.userId) { "Audit identity mismatch." }
        db.collection("auditLogs").document(event.eventId).set(
            mapOf(
                "userId" to event.userId,
                "deviceId" to event.deviceId,
                "feature" to event.feature,
                "action" to event.action,
                "sessionId" to event.sessionId,
                "createdAt" to event.createdAtEpochMs,
                "metadata" to event.metadata
            )
        ).await()
    }

    override suspend fun list(deviceId: String, limit: Int): List<ConsentAuditEvent> {
        val uid = auth.currentUser?.uid ?: return emptyList()
        return db.collection("auditLogs")
            .whereEqualTo("userId", uid)
            .whereEqualTo("deviceId", deviceId)
            .orderBy("createdAt", com.google.firebase.firestore.Query.Direction.DESCENDING)
            .limit(limit.coerceIn(1, 100))
            .get().await().documents.mapNotNull { doc ->
                ConsentAuditEvent(
                    eventId = doc.id,
                    userId = doc.getString("userId") ?: return@mapNotNull null,
                    deviceId = doc.getString("deviceId") ?: return@mapNotNull null,
                    feature = doc.getString("feature") ?: return@mapNotNull null,
                    action = doc.getString("action") ?: return@mapNotNull null,
                    sessionId = doc.getString("sessionId"),
                    createdAtEpochMs = doc.getLong("createdAt") ?: 0L,
                    metadata = (doc.get("metadata") as? Map<*, *>)?.mapNotNull { (k,v) ->
                        if (k is String && v is String) k to v else null
                    }?.toMap() ?: emptyMap()
                )
            }
    }
}