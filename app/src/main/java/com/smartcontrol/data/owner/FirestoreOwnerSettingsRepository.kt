package com.smartcontrol.data.owner

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.smartcontrol.domain.owner.FeatureOverride
import com.smartcontrol.domain.owner.OwnerSettings
import com.smartcontrol.domain.owner.OwnerSettingsRepository
import com.smartcontrol.domain.owner.PermissionCopy
import com.smartcontrol.domain.spec.FeatureId
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

class FirestoreOwnerSettingsRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore
) : OwnerSettingsRepository {
    override suspend fun isAdmin(): Boolean {
        val user = auth.currentUser ?: return false
        return user.getIdToken(false).await().claims["admin"] == true
    }

    override suspend fun observe(): Flow<OwnerSettings> = callbackFlow {
        val registration = firestore.collection("ownerSettings").document("global")
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val data = snapshot?.data.orEmpty()
                trySend(decode(data))
            }
        awaitClose { registration.remove() }
    }

    override suspend fun save(settings: OwnerSettings): Result<Unit> = runCatching {
        check(isAdmin()) { "Admin role required." }
        firestore.collection("ownerSettings").document("global")
            .set(encode(settings)).await()
    }

    private fun encode(settings: OwnerSettings): Map<String, Any> = mapOf(
        "globalFeaturesEnabled" to settings.globalFeaturesEnabled,
        "pushNotificationsEnabled" to settings.pushNotificationsEnabled,
        "emailNotificationsEnabled" to settings.emailNotificationsEnabled,
        "smsNotificationsEnabled" to settings.smsNotificationsEnabled,
        "sosEnabled" to settings.sosEnabled,
        "dataDownloadEnabled" to settings.dataDownloadEnabled,
        "dataShareEnabled" to settings.dataShareEnabled,
        "dataDeleteEnabled" to settings.dataDeleteEnabled,
        "featureOverrides" to settings.featureOverrides.mapKeys { it.key.name }.mapValues {
            mapOf(
                "enabled" to it.value.enabled,
                "maxDurationSeconds" to it.value.maxDurationSeconds,
                "priority" to it.value.priority
            )
        },
        "permissionCopy" to settings.permissionCopy.map {
            mapOf(
                "featureId" to it.featureId.name,
                "title" to it.title,
                "explanation" to it.explanation,
                "displayOrder" to it.displayOrder
            )
        }
    )

    private fun decode(data: Map<String, Any>): OwnerSettings {
        val overrides = (data["featureOverrides"] as? Map<*, *>).orEmpty().mapNotNull { (key, value) ->
            val id = runCatching { FeatureId.valueOf(key.toString()) }.getOrNull() ?: return@mapNotNull null
            val map = value as? Map<*, *> ?: return@mapNotNull null
            id to FeatureOverride(
                featureId = id,
                enabled = map["enabled"] as? Boolean ?: true,
                maxDurationSeconds = (map["maxDurationSeconds"] as? Number)?.toLong(),
                priority = (map["priority"] as? Number)?.toInt() ?: 0
            )
        }.toMap()
        val copies = (data["permissionCopy"] as? List<*>).orEmpty().mapNotNull { value ->
            val map = value as? Map<*, *> ?: return@mapNotNull null
            val id = runCatching { FeatureId.valueOf(map["featureId"].toString()) }.getOrNull() ?: return@mapNotNull null
            PermissionCopy(
                featureId = id,
                title = map["title"]?.toString() ?: id.name,
                explanation = map["explanation"]?.toString() ?: "",
                displayOrder = (map["displayOrder"] as? Number)?.toInt() ?: 0
            )
        }
        return OwnerSettings(
            globalFeaturesEnabled = data["globalFeaturesEnabled"] as? Boolean ?: true,
            featureOverrides = overrides,
            permissionCopy = copies,
            pushNotificationsEnabled = data["pushNotificationsEnabled"] as? Boolean ?: true,
            emailNotificationsEnabled = data["emailNotificationsEnabled"] as? Boolean ?: false,
            smsNotificationsEnabled = data["smsNotificationsEnabled"] as? Boolean ?: false,
            sosEnabled = data["sosEnabled"] as? Boolean ?: true,
            dataDownloadEnabled = data["dataDownloadEnabled"] as? Boolean ?: true,
            dataShareEnabled = data["dataShareEnabled"] as? Boolean ?: false,
            dataDeleteEnabled = data["dataDeleteEnabled"] as? Boolean ?: true
        )
    }
}
