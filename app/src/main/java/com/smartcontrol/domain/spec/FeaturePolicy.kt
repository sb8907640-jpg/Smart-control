package com.smartcontrol.domain.spec

/**
 * Safe, client-readable projection of owner feature policy.
 * It intentionally contains no owner contact details, payment credentials, or other private settings.
 */
data class FeaturePolicy(
    val globalFeaturesEnabled: Boolean = true,
    val globalEnabled: Boolean = true,
    val featureOverrides: Map<FeatureId, Boolean> = emptyMap(),
    val globalFeatureOverrides: Map<FeatureId, Boolean> = emptyMap(),
    val perUser: Map<String, UserFeaturePolicy> = emptyMap()
)

data class UserFeaturePolicy(
    val enabled: Boolean = true,
    val featureOverrides: Map<FeatureId, Boolean> = emptyMap()
)
