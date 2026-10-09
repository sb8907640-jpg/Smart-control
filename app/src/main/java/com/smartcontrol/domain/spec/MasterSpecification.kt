package com.smartcontrol.domain.spec

/**
 * Canonical data contract for the supplied Smart Control master specification.
 *
 * Android OS permissions, MediaProjection, Accessibility, notification access,
 * and user approval remain mandatory at the feature/session layer.
 */
data class MasterControlConfig(
    val app: AppBrandingConfig = AppBrandingConfig(),
    val permissions: PermissionConfig = PermissionConfig(),
    val access: AccessConfig = AccessConfig(),
    val plans: PlanConfig = PlanConfig(),
    val connection: ConnectionConfig = ConnectionConfig(),
    val notifications: NotificationConfig = NotificationConfig(),
    val content: ContentConfig = ContentConfig(),
    val security: SecurityConfig = SecurityConfig(),
    val support: SupportConfig = SupportConfig(),
    val ownerControl: OwnerControlConfig = OwnerControlConfig()
)

data class AppBrandingConfig(
    val appName: String = "Family Suraksha",
    val shortName: String = "Family Suraksha",
    val logoResourceName: String? = null,
    val themeKey: String = "default",
    val primaryColor: String? = null,
    val secondaryColor: String? = null
)

enum class PermissionMode { ONE_BY_ONE, ALLOW_ALL_BY_USER_TAP }

data class PermissionConfig(
    val mode: PermissionMode = PermissionMode.ONE_BY_ONE,
    val showFeatureExplanation: Boolean = true,
    val showLiveIndicator: Boolean = true,
    val allowUserDenyIndividualFeature: Boolean = true,
    val displayOrder: List<FeatureId> = FeatureCatalog.all.map { it.id },
    val copy: Map<FeatureId, PermissionText> = emptyMap()
)

data class PermissionText(
    val title: String,
    val explanation: String,
    val iconKey: String? = null
)

data class AccessConfig(
    val globalEnabled: Boolean = true,
    val perUser: Map<String, UserFeatureAccess> = emptyMap(),
    val globalFeatureOverrides: Map<FeatureId, FeatureAccess> = emptyMap()
)

data class UserFeatureAccess(
    val enabled: Boolean = true,
    val featureOverrides: Map<FeatureId, FeatureAccess> = emptyMap(),
    val planId: String? = null
)

data class FeatureAccess(
    val enabled: Boolean = true,
    val maxDurationSeconds: Long? = null,
    val priority: Int = 0
)

data class PlanConfig(
    val freePlan: PlanDefinition = PlanDefinition(
        id = "free",
        displayName = "Free",
        manuallyApproved = true
    ),
    val plans: List<PlanDefinition> = emptyList(),
    val freePlanVisibleInPublicMenu: Boolean = false
)

data class PlanDefinition(
    val id: String,
    val displayName: String,
    val manuallyApproved: Boolean = false,
    val enabledFeatures: Set<FeatureId> = emptySet(),
    val featureLimitsSeconds: Map<FeatureId, Long> = emptyMap()
)

data class ConnectionConfig(
    val pairingRequired: Boolean = true,
    val persistentPairing: Boolean = true,
    val reconnectOnNetworkChange: Boolean = true,
    val reconnectAfterProcessRestart: Boolean = true,
    val foregroundServicePreferred: Boolean = true,
    val sessionApprovalRequired: Boolean = true,
    val sessionExpirySeconds: Long = 3600L
)

data class NotificationConfig(
    val pushEnabled: Boolean = true,
    val emailEnabled: Boolean = false,
    val smsEnabled: Boolean = false,
    val showActiveSessionNotification: Boolean = true,
    val showPermissionRevokedAlert: Boolean = true,
    val showConnectionState: Boolean = true
)

data class ContentConfig(
    val supportText: String = "WhatsApp Support",
    val privacyText: String = "Privacy and consent controls",
    val termsText: String = "Terms and conditions",
    val permissionIntroText: String = "Choose which features you want to allow.",
    val stopText: String = "Stop / Disconnect",
    val links: Map<String, String> = emptyMap()
)

data class SecurityConfig(
    val requireAuthenticatedController: Boolean = true,
    val requireAuthenticatedClient: Boolean = true,
    val requireTwoFactorForAdmin: Boolean = true,
    val requireOtpForSensitiveAuth: Boolean = true,
    val consentAuditEnabled: Boolean = true,
    val appLayerEncryptionEnabled: Boolean = true,
    val encryptionAlgorithm: String = "AES-256-GCM"
)

data class SupportConfig(
    val enabled: Boolean = true,
    val publicNumber: String? = null,
    val showOwnerIdentityToClient: Boolean = false
)

object MasterSpecification {
    const val VERSION = "1.0"

    val featureIds: List<FeatureId> = FeatureCatalog.all.map { it.id }

    init {
        check(featureIds.size == 19) { "Master specification must contain exactly 19 features." }
        check(featureIds.distinct().size == featureIds.size) {
            "Master specification contains duplicate feature IDs."
        }
    }
}
