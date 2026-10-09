package com.smartcontrol.data.owner

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.smartcontrol.domain.spec.FeatureId
import com.smartcontrol.domain.spec.FeaturePolicy
import com.smartcontrol.domain.spec.UserFeaturePolicy
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine

@Singleton
class FirestoreFeaturePolicyRepository @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val auth: FirebaseAuth
) {
    fun observe(userId: String = auth.currentUser?.uid.orEmpty()): Flow<FeaturePolicy> =
        combine(observeGlobal(), observeUser(userId)) { global, user ->
            global.copy(userPolicy = user)
        }

    private fun observeGlobal(): Flow<FeaturePolicy> = callbackFlow {
        val registration = firestore.collection("featurePolicy").document("global")
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(decodeGlobal(snapshot?.data.orEmpty()))
            }
        awaitClose { registration.remove() }
    }

    private fun observeUser(userId: String): Flow<UserFeaturePolicy?> = callbackFlow {
        if (userId.isBlank()) {
            trySend(null)
            close()
            return@callbackFlow
        }
        val registration = firestore.collection("featurePolicyUsers").document(userId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(snapshot?.data?.let(::decodeUser))
            }
        awaitClose { registration.remove() }
    }

    private fun decodeGlobal(data: Map<String, Any>): FeaturePolicy = FeaturePolicy(
        globalFeaturesEnabled = data["globalFeaturesEnabled"] as? Boolean ?: true,
        globalEnabled = data["globalEnabled"] as? Boolean ?: true,
        featureOverrides = boolFeatureMap(data["featureOverrides"]),
        globalFeatureOverrides = boolFeatureMap(data["globalFeatureOverrides"])
    )

    private fun decodeUser(data: Map<String, Any>): UserFeaturePolicy = UserFeaturePolicy(
        enabled = data["enabled"] as? Boolean ?: true,
        featureOverrides = boolFeatureMap(data["featureOverrides"])
    )

    private fun boolFeatureMap(raw: Any?): Map<FeatureId, Boolean> =
        (raw as? Map<*, *>).orEmpty().mapNotNull { (key, value) ->
            val id = runCatching { FeatureId.valueOf(key.toString()) }.getOrNull()
                ?: return@mapNotNull null
            val enabled = value as? Boolean ?: return@mapNotNull null
            id to enabled
        }.toMap()
}
