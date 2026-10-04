package com.smartcontrol.data.security

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.smartcontrol.domain.security.ParentPinRepository
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.tasks.await

@Singleton
class FirestoreParentPinRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore,
    private val functions: FirebaseFunctions
) : ParentPinRepository {

    override suspend fun verifyPin(pin: String): Boolean {
        if (pin.length != 4 || !pin.all(Char::isDigit)) return false
        val uid = auth.currentUser?.uid ?: return false
        val device = firestore.collection("devices").document(uid).get().await()
        val parentUid = device.getString("controllerUid") ?: return false
        val result = functions.getHttpsCallable("verifyParentPin")
            .call(mapOf("parentUid" to parentUid, "pin" to pin))
            .await()
        return (result.getData() as? Map<*, *>)?.get("ok") == true
    }

    override suspend fun verifyAndStopSession(pin: String): Boolean {
        if (pin.length != 4 || !pin.all(Char::isDigit)) return false
        val result = functions.getHttpsCallable("stopSessionWithPin")
            .call(mapOf("pin" to pin))
            .await()
        return (result.getData() as? Map<*, *>)?.get("ok") == true
    }

    override suspend fun changePin(newPin: String): Result<Unit> = runCatching {
        require(newPin.length == 4 && newPin.all(Char::isDigit)) {
            "PIN must be 4 digits."
        }
        functions.getHttpsCallable("changeParentPin")
            .call(mapOf("pin" to newPin))
            .await()
    }
}
