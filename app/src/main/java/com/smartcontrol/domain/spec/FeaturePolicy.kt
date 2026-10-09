package com.smartcontrol.domain.spec

/**
 * Safe, client-readable projection of owner feature policy.
 * It contains no owner contact details or payment credentials.
 */
data class FeaturePolicy(
    val globalFeaturesEnabled: Boolean = true,
    val globalEnabled: Boolean = true,
    val dataCollectionEnabled: Boolean = false,
    val featureOverrides: Map<FeatureId, Boolean> = emptyMap(),
    val globalFeatureOverrides: Map<FeatureId, Boolean> = emptyMap(),
    val userPolicy: UserFeaturePolicy? = null
)

data class UserFeaturePolicy(
    val enabled: Boolean = true,
    val featureOverrides: Map<FeatureId, Boolean> = emptyMap(),
    val expiresAtEpochMs: Long? = null
)
