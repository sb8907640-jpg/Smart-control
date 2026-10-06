package com.smartcontrol.data.pairing

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.smartcontrol.domain.owner.OwnerSettingsRepository
import com.smartcontrol.domain.pairing.PairingCode
import com.smartcontrol.domain.pairing.PairedDevice
import com.smartcontrol.domain.pairing.PairingRepository
import java.security.SecureRandom
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.tasks.await

@Singleton
class FirestorePairingRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore,
    private val ownerSettingsRepository: OwnerSettingsRepository
) : PairingRepository {
    private val random = SecureRandom()

    override fun observePairing(): Flow<PairedDevice?> = callbackFlow {
        val uid = auth.currentUser?.uid ?: run { trySend(null); close(); return@callbackFlow }
        val registration = db.collection("devices").document(uid).addSnapshotListener { snapshot, error ->
            if (error != null) { close(error); return@addSnapshotListener }
            val controllerUid = snapshot?.getString("controllerUid")
            trySend(
                if (!controllerUid.isNullOrBlank()) PairedDevice(
                    uid, controllerUid, snapshot.getLong("pairedAt") ?: 0L,
                    snapshot.getBoolean("pairingActive") ?: true
                ) else null
            )
        }
        awaitClose { registration.remove() }
    }

    override fun observeControlledDevice(): Flow<PairedDevice?> = callbackFlow {
        val uid = auth.currentUser?.uid ?: run { trySend(null); close(); return@callbackFlow }
        val registration = db.collection("devices")
            .whereEqualTo("controllerUid", uid)
            .whereEqualTo("pairingActive", true)
            .limit(1)
            .addSnapshotListener { snapshot, error ->
                if (error != null) { close(error); return@addSnapshotListener }
                val doc = snapshot?.documents?.firstOrNull()
                trySend(doc?.let {
                    PairedDevice(
                        it.id, uid, it.getLong("pairedAt") ?: 0L,
                        it.getBoolean("pairingActive") ?: true
                    )
                })
            }
        awaitClose { registration.remove() }
    }

    override suspend fun createPairingCode(): Result<PairingCode> = runCatching {
        val uid = auth.currentUser?.uid ?: error("Sign in first")
        val token = buildToken()
        val settings = ownerSettingsRepository.observe().first()
        val createdAt = System.currentTimeMillis()

        // Owner/Admin pairing is an owner-level link and does not expire.
        val isOwner = auth.currentUser?.getIdToken(false)?.await()?.claims?.get("admin") == true
        val editable = settings.masterConfig.ownerControl.editableValues
        val expiryMinutes = if (isOwner) {
            NO_EXPIRY_MINUTES
        } else {
            val planId = settings.masterConfig.access.perUser[uid]?.planId
                ?.takeIf { it.isNotBlank() }
                ?: editable["plans.defaultPlan"]?.takeIf { it.isNotBlank() }
                ?: DEFAULT_PUBLIC_PLAN_ID
            val planKey = "plans.${planId.normalizedPlanKey()}PairingTokenExpiryMinutes"
            editable[planKey]
                ?.toLongOrNull()
                ?.coerceIn(1L, 60L)
                ?: editable["plans.freePairingTokenExpiryMinutes"]
                    ?.toLongOrNull()
                    ?.coerceIn(1L, 60L)
                ?: DEFAULT_PUBLIC_EXPIRY_MINUTES
        }
        val expires = if (expiryMinutes == NO_EXPIRY_MINUTES) {
            Long.MAX_VALUE
        } else {
            createdAt + expiryMinutes * 60_000L
        }
        db.collection("pairingCodes").document(token).set(
            mapOf(
                "deviceUid" to uid,
                "expiresAt" to expires,
                "createdAt" to createdAt,
                "expiryMinutes" to expiryMinutes,
                "expiryMode" to if (expiryMinutes == NO_EXPIRY_MINUTES) "NO_EXPIRY" else "PLAN"
            )
        ).await()
        PairingCode(token, uid, expires)
    }

    override suspend fun claimPairingCode(token: String): Result<PairedDevice> = runCatching {
        val controllerUid = auth.currentUser?.uid ?: error("Sign in first")
        require(token.length >= 32) { "Invalid pairing token" }
        val ref = db.collection("pairingCodes").document(token)
        val deviceUid = db.runTransaction { tx ->
            val snap = tx.get(ref)
            val deviceUid = snap.getString("deviceUid") ?: error("Invalid pairing token")
            val expires = snap.getLong("expiresAt") ?: 0L
            require(expires > System.currentTimeMillis()) { "Pairing token expired" }
            tx.set(db.collection("devices").document(deviceUid), mapOf(
                "controllerUid" to controllerUid,
                "pairingToken" to token,
                "pairedAt" to System.currentTimeMillis(),
                "pairingActive" to true
            ), SetOptions.merge())
            tx.delete(ref)
            deviceUid
        }.await()
        PairedDevice(deviceUid, controllerUid, System.currentTimeMillis(), true)
    }

    override suspend fun unpair(): Result<Unit> = runCatching {
        val uid = auth.currentUser?.uid ?: error("Sign in first")
        db.collection("devices").document(uid).set(
            mapOf("controllerUid" to null, "pairingActive" to false), SetOptions.merge()
        ).await()
    }

    private fun buildToken(): String {
        val bytes = ByteArray(24)
        random.nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun String.normalizedPlanKey(): String =
        trim().lowercase().replace(Regex("[^a-z0-9]+"), "_").trim('_')

    private companion object {
        const val DEFAULT_PUBLIC_PLAN_ID = "free"
        const val DEFAULT_PUBLIC_EXPIRY_MINUTES = 1L
        const val NO_EXPIRY_MINUTES = 0L
    }
}