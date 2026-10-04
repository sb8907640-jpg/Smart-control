package com.smartcontrol.domain.owner

import com.smartcontrol.domain.spec.FeatureId

data class FeatureOverride(
    val featureId: FeatureId,
    val enabled: Boolean,
    val maxDurationSeconds: Long?,
    val priority: Int
)

data class PermissionCopy(
    val featureId: FeatureId,
    val title: String,
    val explanation: String,
    val displayOrder: Int
)

data class OwnerSettings(
    val globalFeaturesEnabled: Boolean,
    val featureOverrides: Map<FeatureId, FeatureOverride>,
    val permissionCopy: List<PermissionCopy>,
    val pushNotificationsEnabled: Boolean,
    val emailNotificationsEnabled: Boolean,
    val smsNotificationsEnabled: Boolean,
    val sosEnabled: Boolean,
    val dataDownloadEnabled: Boolean,
    val dataShareEnabled: Boolean,
    val dataDeleteEnabled: Boolean
)

interface OwnerSettingsRepository {
    suspend fun observe(): kotlinx.coroutines.flow.Flow<OwnerSettings>
    suspend fun save(settings: OwnerSettings): Result<Unit>
}
