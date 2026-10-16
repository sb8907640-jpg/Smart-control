package com.smartcontrol.data.pairing

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.firebase.functions.FirebaseFunctions
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
    private val db: FirebaseFirestore
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
                    snapshot.getBoolean("pairingActive") ?: true,
                    snapshot.getString("senderRole") ?: "Other",
                    snapshot.getString("receiverRole") ?: "Other",
                    (snapshot.get("health.lastHeartbeatAt") as? Number)?.toLong()
                ) else null
            )
        }
        awaitClose { registration.remove() }
    }

    override fun observeControlledDevices(): Flow<List<PairedDevice>> = callbackFlow {
        val uid = auth.currentUser?.uid ?: run { trySend(emptyList()); close(); return@callbackFlow }
        val registration = db.collection("devices")
            .whereEqualTo("controllerUid", uid)
            .whereEqualTo("pairingActive", true)
            .addSnapshotListener { snapshot, error ->
                if (error != null) { close(error); return@addSnapshotListener }
                trySend(snapshot?.documents?.map { doc ->
                    PairedDevice(
                        doc.id, uid, doc.getLong("pairedAt") ?: 0L,
                        doc.getBoolean("pairingActive") ?: true,
                        doc.getString("senderRole") ?: "Other",
                        doc.getString("receiverRole") ?: "Other",
                        (doc.get("health.lastHeartbeatAt") as? Number)?.toLong()
                    )
                }.orEmpty())
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
                        it.getBoolean("pairingActive") ?: true,
                        it.getString("senderRole") ?: "Other",
                        it.getString("receiverRole") ?: "Other",
                        (it.get("health.lastHeartbeatAt") as? Number)?.toLong()
                    )
                })
            }
        awaitClose { registration.remove() }
    }

    override suspend fun createPairingCode(senderRole: String, receiverRole: String): Result<PairingCode> = runCatching {
        val uid = auth.currentUser?.uid ?: error("Sign in first")
        require(senderRole in ROLE_TYPES) { "Choose a valid sender relationship." }
        require(receiverRole in ROLE_TYPES) { "Choose a valid receiver relationship." }
        val token = buildToken()
        val createdAt = System.currentTimeMillis()

        // Never read the private ownerSettings document from a normal client.
        // The callable returns only the effective pairing-code lifetime.
        val claims = auth.currentUser?.getIdToken(false)?.await()?.claims.orEmpty()
        val isOwner = claims["admin"] == true || claims["role"]?.toString()?.uppercase() == "OWNER"
        val policy = runCatching {
            FirebaseFunctions.getInstance()
                .getHttpsCallable("getDevicePairingPolicy")
                .call()
                .await()
                .getData() as? Map<*, *>
        }.getOrNull()
        val expiryMinutes = if (isOwner) {
            NO_EXPIRY_MINUTES
        } else {
            (policy?.get("expiryMinutes") as? Number)
                ?.toLong()
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
                "expiryMode" to if (expiryMinutes == NO_EXPIRY_MINUTES) "NO_EXPIRY" else "PLAN",
                "senderRole" to senderRole,
                "receiverRole" to receiverRole
            )
        ).await()
        PairingCode(token, uid, expires, senderRole, receiverRole)
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
            val senderRole = snap.getString("senderRole")?.takeIf { it in ROLE_TYPES } ?: "Other"
            val receiverRole = snap.getString("receiverRole")?.takeIf { it in ROLE_TYPES } ?: "Other"
            tx.set(db.collection("devices").document(deviceUid), mapOf(
                "controllerUid" to controllerUid,
                "pairingToken" to token,
                "pairedAt" to System.currentTimeMillis(),
                "pairingActive" to true,
                "senderRole" to senderRole,
                "receiverRole" to receiverRole
            ), SetOptions.merge())
            tx.delete(ref)
            Triple(deviceUid, senderRole, receiverRole)
        }.await()
        PairedDevice(deviceUid.first, controllerUid, System.currentTimeMillis(), true, deviceUid.second, deviceUid.third)
    }

    override suspend fun unpair(): Result<Unit> = runCatching {
        val uid = auth.currentUser?.uid ?: error("Sign in first")
        val ownRef = db.collection("devices").document(uid)
        val refs = linkedMapOf<String, com.google.firebase.firestore.DocumentReference>()

        // If this account is the receiving device, unlink its controller.
        val ownSnapshot = ownRef.get().await()
        if (!ownSnapshot.getString("controllerUid").isNullOrBlank()) {
            refs[ownRef.path] = ownRef
        }

        // If this account is the controller, unlink every device it controls too.
        val controlled = db.collection("devices")
            .whereEqualTo("controllerUid", uid)
            .whereEqualTo("pairingActive", true)
            .get()
            .await()
        controlled.documents.forEach { refs[it.reference.path] = it.reference }

        val batch = db.batch()
        refs.values.forEach { ref ->
            batch.set(
                ref,
                mapOf("controllerUid" to null, "pairingActive" to false),
                SetOptions.merge()
            )
        }
        if (refs.isNotEmpty()) batch.commit().await()
    }

    private fun buildToken(): String {
        val bytes = ByteArray(24)
        random.nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private companion object {
        val ROLE_TYPES = setOf("Father", "Mother", "Son", "Daughter", "Brother", "Sister", "Husband", "Wife", "Mechanic", "Engineer", "Other")
        const val DEFAULT_PUBLIC_EXPIRY_MINUTES = 10L
        const val NO_EXPIRY_MINUTES = 0L
    }
}