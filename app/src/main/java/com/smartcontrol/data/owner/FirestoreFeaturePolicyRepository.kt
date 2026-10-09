package com.smartcontrol.data.owner

import com.google.firebase.firestore.FirebaseFirestore
import com.smartcontrol.domain.spec.FeatureId
import com.smartcontrol.domain.spec.FeaturePolicy
import com.smartcontrol.domain.spec.UserFeaturePolicy
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

@Singleton
class FirestoreFeaturePolicyRepository @Inject constructor(
    private val firestore: FirebaseFirestore
) {
    fun observe(): Flow<FeaturePolicy> = callbackFlow {
        val registration = firestore.collection("featurePolicy").document("global")
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(decode(snapshot?.data.orEmpty()))
            }
        awaitClose { registration.remove() }
    }

    private fun decode(data: Map<String, Any>): FeaturePolicy {
        val overrides = boolFeatureMap(data["featureOverrides"])
        val globalOverrides = boolFeatureMap(data["globalFeatureOverrides"])
        val perUser = (data["perUser"] as? Map<*, *>).orEmpty().mapNotNull { (rawUid, rawValue) ->
            val uid = rawUid?.toString()?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val value = rawValue as? Map<*, *> ?: return@mapNotNull null
            uid to UserFeaturePolicy(
                enabled = value["enabled"] as? Boolean ?: true,
                featureOverrides = boolFeatureMap(value["featureOverrides"])
            )
        }.toMap()
        return FeaturePolicy(
            globalFeaturesEnabled = data["globalFeaturesEnabled"] as? Boolean ?: true,
            globalEnabled = data["globalEnabled"] as? Boolean ?: true,
            featureOverrides = overrides,
            globalFeatureOverrides = globalOverrides,
            perUser = perUser
        )
    }

    private fun boolFeatureMap(raw: Any?): Map<FeatureId, Boolean> =
        (raw as? Map<*, *>).orEmpty().mapNotNull { (key, value) ->
            val id = runCatching { FeatureId.valueOf(key.toString()) }.getOrNull()
                ?: return@mapNotNull null
            val enabled = value as? Boolean ?: return@mapNotNull null
            id to enabled
        }.toMap()
}
