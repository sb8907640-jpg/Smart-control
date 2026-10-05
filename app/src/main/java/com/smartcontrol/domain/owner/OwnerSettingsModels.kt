package com.smartcontrol.domain.owner

import com.smartcontrol.domain.spec.FeatureId
import com.smartcontrol.domain.spec.MasterControlConfig

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

data class OwnerSettingsHistoryEntry(
    val id: String,
    val changedBy: String,
    val changedAtEpochMs: Long,
    val summary: String,
    val settings: OwnerSettings
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
    val dataDeleteEnabled: Boolean,
    /**
     * Canonical master-spec configuration. Kept last with a default so existing
     * callers remain source-compatible while the complete configuration is persisted.
     */
    val masterConfig: MasterControlConfig = MasterControlConfig()
)

interface OwnerSettingsRepository {
    suspend fun isAdmin(): Boolean
    suspend fun observe(): kotlinx.coroutines.flow.Flow<OwnerSettings>
    suspend fun save(settings: OwnerSettings): Result<Unit>
    suspend fun observeHistory(): kotlinx.coroutines.flow.Flow<List<OwnerSettingsHistoryEntry>>
    suspend fun rollback(historyId: String): Result<Unit>
}
