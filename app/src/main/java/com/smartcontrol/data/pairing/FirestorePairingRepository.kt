package com.smartcontrol.data.pairing

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import com.smartcontrol.domain.pairing.PairingCode
import com.smartcontrol.domain.pairing.PairedDevice
import com.smartcontrol.domain.pairing.PairingRepository
import java.security.SecureRandom
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

@Singleton
class FirestorePairingRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore
) : PairingRepository {
    private val random = SecureRandom()

    override fun observePairing(): Flow<PairedDevice?> = callbackFlow {
        val uid = auth.currentUser?.uid
        if (uid == null) {
            trySend(null)
            close()
            return@callbackFlow
        }
        val registration: ListenerRegistration =
            db.collection("devices").document(uid).addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val controllerUid = snapshot?.getString("controllerUid")
                trySend(
                    if (!controllerUid.isNullOrBlank()) {
                        PairedDevice(
                            uid,
                            controllerUid,
                            snapshot.getLong("pairedAt") ?: 0L,
                            snapshot.getBoolean("pairingActive") ?: true
                        )
                    } else null
                )
            }
        awaitClose { registration.remove() }
    }

    override suspend fun createPairingCode(): Result<PairingCode> = runCatching {
        val uid = auth.currentUser?.uid ?: error("Sign in first")
        val token = buildToken()
        val expires = System.currentTimeMillis() + 10 * 60 * 1000L
        db.collection("pairingCodes").document(token).set(
            mapOf("deviceUid" to uid, "expiresAt" to expires, "createdAt" to System.currentTimeMillis())
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
            tx.set(
                db.collection("devices").document(deviceUid),
                mapOf(
                    "controllerUid" to controllerUid,
                    "pairedAt" to System.currentTimeMillis(),
                    "pairingActive" to true
                ),
                SetOptions.merge()
            )
            tx.delete(ref)
            deviceUid
        }.await()
        PairedDevice(deviceUid, controllerUid, System.currentTimeMillis(), true)
    }

    override suspend fun unpair(): Result<Unit> = runCatching {
        val uid = auth.currentUser?.uid ?: error("Sign in first")
        db.collection("devices").document(uid).set(
            mapOf("controllerUid" to null, "pairingActive" to false),
            SetOptions.merge()
        ).await()
    }

    private fun buildToken(): String {
        val bytes = ByteArray(24)
        random.nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
