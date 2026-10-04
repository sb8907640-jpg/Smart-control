package com.smartcontrol.data.safety

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.smartcontrol.domain.safety.SafetyAlert
import com.smartcontrol.domain.safety.SafetyAlertRepository
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

class FirestoreSafetyAlertRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore
) : SafetyAlertRepository {
    override suspend fun create(alert: SafetyAlert): Result<Unit> = runCatching {
        val uid = auth.currentUser?.uid ?: error("Authentication required")
        firestore.collection("devices").document(alert.deviceId)
            .collection("statusAlerts").document(alert.alertId)
            .set(mapOf(
                "alertId" to alert.alertId,
                "deviceId" to alert.deviceId,
                "type" to alert.type,
                "message" to alert.message,
                "createdAt" to alert.createdAtEpochMs,
                "acknowledged" to alert.acknowledged,
                "createdBy" to uid
            )).await()
    }

    override suspend fun acknowledge(alertId: String): Result<Unit> = runCatching {
        val uid = auth.currentUser?.uid ?: error("Authentication required")
        val deviceId = auth.currentUser?.uid ?: error("Device identity unavailable")
        firestore.collection("devices").document(deviceId)
            .collection("statusAlerts").document(alertId)
            .update("acknowledged", true, "acknowledgedBy", uid).await()
    }

    override suspend fun observe(deviceId: String): Flow<List<SafetyAlert>> = callbackFlow {
        val registration = firestore.collection("devices").document(deviceId)
            .collection("statusAlerts")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(50)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error); return@addSnapshotListener
                }
                trySend(snapshot?.documents.orEmpty().mapNotNull { d ->
                    val id = d.getString("alertId") ?: d.id
                    val type = d.getString("type") ?: return@mapNotNull null
                    val message = d.getString("message") ?: ""
                    SafetyAlert(id, deviceId, type, message, d.getLong("createdAt") ?: 0L, d.getBoolean("acknowledged") ?: false)
                })
            }
        awaitClose { registration.remove() }
    }
}
