package com.smartcontrol.data.owner

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.smartcontrol.domain.owner.FeatureOverride
import com.smartcontrol.domain.owner.OwnerSettings
import com.smartcontrol.domain.owner.OwnerSettingsRepository
import com.smartcontrol.domain.owner.PermissionCopy
import com.smartcontrol.domain.spec.FeatureAccess
import com.smartcontrol.domain.spec.FeatureId
import com.smartcontrol.domain.spec.MasterControlConfig
import com.smartcontrol.domain.spec.OwnerControlConfig
import com.smartcontrol.domain.spec.PermissionMode
import com.smartcontrol.domain.spec.PermissionText
import com.smartcontrol.domain.spec.PlanDefinition
import com.smartcontrol.domain.spec.UserFeatureAccess
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
                trySend(decode(snapshot?.data.orEmpty()))
            }
        awaitClose { registration.remove() }
    }

    override suspend fun save(settings: OwnerSettings): Result<Unit> = runCatching {
        check(isAdmin()) { "Admin role required." }
        // Merge prevents older/unknown ownerSettings fields from being deleted while
        // the master-spec fields are added or changed.
        val encoded = encode(settings)
        if (settings.masterConfig.ownerControl.changeLogEnabled) {
            firestore.collection("ownerSettingsHistory").document().set(
                mapOf(
                    "changedBy" to auth.currentUser?.uid.orEmpty(),
                    "changedAtEpochMs" to System.currentTimeMillis(),
                    "summary" to "Owner settings update",
                    "settings" to encoded
                )
            ).await()
        }
        firestore.collection("ownerSettings").document("global")
            .set(encoded, SetOptions.merge())
            .await()
    }

    override suspend fun observeHistory(): Flow<List<com.smartcontrol.domain.owner.OwnerSettingsHistoryEntry>> =
        callbackFlow {
            check(isAdmin()) { "Admin role required." }
            val registration = firestore.collection("ownerSettingsHistory")
                .orderBy("changedAtEpochMs", com.google.firebase.firestore.Query.Direction.DESCENDING)
                .limit(50)
                .addSnapshotListener { snapshot, error ->
                    if (error != null) {
                        close(error)
                        return@addSnapshotListener
                    }
                    trySend(
                        snapshot?.documents.orEmpty().mapNotNull { doc ->
                            val data = doc.data.orEmpty()
                            val raw = data["settings"] as? Map<*, *> ?: return@mapNotNull null
                            val typed = raw.entries.associate { it.key.toString() to it.value }
                            com.smartcontrol.domain.owner.OwnerSettingsHistoryEntry(
                                id = doc.id,
                                changedBy = data["changedBy"]?.toString().orEmpty(),
                                changedAtEpochMs = (data["changedAtEpochMs"] as? Number)?.toLong() ?: 0L,
                                summary = data["summary"]?.toString().orEmpty(),
                                settings = decode(typed)
                            )
                        }
                    )
                }
            awaitClose { registration.remove() }
        }

    override suspend fun rollback(historyId: String): Result<Unit> = runCatching {
        check(isAdmin()) { "Admin role required." }
        val snapshot = firestore.collection("ownerSettingsHistory").document(historyId).get().await()
        val raw = snapshot.data?.get("settings") as? Map<*, *>
            ?: error("History snapshot not found.")
        val typed = raw.entries.associate { it.key.toString() to it.value }
        firestore.collection("ownerSettings").document("global")
            .set(encode(decode(typed)), SetOptions.merge())
            .await()
    }

    private fun encode(settings: OwnerSettings): Map<String, Any?> {
        val config = settings.masterConfig
        return mapOf(
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
            },
            "masterSpecificationVersion" to MasterControlConfigVersion,
            "masterConfig" to encodeMasterConfig(config)
        )
    }

    private fun encodeMasterConfig(config: MasterControlConfig): Map<String, Any?> = mapOf(
        "app" to mapOf(
            "appName" to config.app.appName,
            "shortName" to config.app.shortName,
            "logoResourceName" to config.app.logoResourceName,
            "themeKey" to config.app.themeKey,
            "primaryColor" to config.app.primaryColor,
            "secondaryColor" to config.app.secondaryColor
        ),
        "permissions" to mapOf(
            "mode" to config.permissions.mode.name,
            "showFeatureExplanation" to config.permissions.showFeatureExplanation,
            "showLiveIndicator" to config.permissions.showLiveIndicator,
            "allowUserDenyIndividualFeature" to config.permissions.allowUserDenyIndividualFeature,
            "displayOrder" to config.permissions.displayOrder.map { it.name },
            "copy" to config.permissions.copy.mapKeys { it.key.name }.mapValues { (_, value) ->
                mapOf(
                    "title" to value.title,
                    "explanation" to value.explanation,
                    "iconKey" to value.iconKey
                )
            }
        ),
        "access" to mapOf(
            "globalEnabled" to config.access.globalEnabled,
            "globalFeatureOverrides" to config.access.globalFeatureOverrides.mapKeys { it.key.name }
                .mapValues { (_, value) -> encodeFeatureAccess(value) },
            "perUser" to config.access.perUser.mapValues { (_, user) ->
                mapOf(
                    "enabled" to user.enabled,
                    "planId" to user.planId,
                    "featureOverrides" to user.featureOverrides.mapKeys { it.key.name }
                        .mapValues { (_, value) -> encodeFeatureAccess(value) }
                )
            }
        ),
        "plans" to mapOf(
            "freePlanVisibleInPublicMenu" to config.plans.freePlanVisibleInPublicMenu,
            "freePlan" to encodePlan(config.plans.freePlan),
            "plans" to config.plans.plans.map(::encodePlan)
        ),
        "connection" to mapOf(
            "pairingRequired" to config.connection.pairingRequired,
            "persistentPairing" to config.connection.persistentPairing,
            "reconnectOnNetworkChange" to config.connection.reconnectOnNetworkChange,
            "reconnectAfterProcessRestart" to config.connection.reconnectAfterProcessRestart,
            "foregroundServicePreferred" to config.connection.foregroundServicePreferred,
            "sessionApprovalRequired" to config.connection.sessionApprovalRequired,
            "sessionExpirySeconds" to config.connection.sessionExpirySeconds
        ),
        "notifications" to mapOf(
            "pushEnabled" to config.notifications.pushEnabled,
            "emailEnabled" to config.notifications.emailEnabled,
            "smsEnabled" to config.notifications.smsEnabled,
            "showActiveSessionNotification" to config.notifications.showActiveSessionNotification,
            "showPermissionRevokedAlert" to config.notifications.showPermissionRevokedAlert,
            "showConnectionState" to config.notifications.showConnectionState
        ),
        "content" to mapOf(
            "supportText" to config.content.supportText,
            "privacyText" to config.content.privacyText,
            "termsText" to config.content.termsText,
            "permissionIntroText" to config.content.permissionIntroText,
            "stopText" to config.content.stopText,
            "links" to config.content.links
        ),
        "security" to mapOf(
            "requireAuthenticatedController" to config.security.requireAuthenticatedController,
            "requireAuthenticatedClient" to config.security.requireAuthenticatedClient,
            "requireTwoFactorForAdmin" to config.security.requireTwoFactorForAdmin,
            "requireOtpForSensitiveAuth" to config.security.requireOtpForSensitiveAuth,
            "consentAuditEnabled" to config.security.consentAuditEnabled,
            "appLayerEncryptionEnabled" to config.security.appLayerEncryptionEnabled,
            "encryptionAlgorithm" to config.security.encryptionAlgorithm
        ),
        "support" to mapOf(
            "enabled" to config.support.enabled,
            "publicNumber" to config.support.publicNumber,
            "showOwnerIdentityToClient" to config.support.showOwnerIdentityToClient
        ),
        "ownerControl" to mapOf(
            "ownerRole" to config.ownerControl.ownerRole,
            "ownerPanelHiddenFromNormalUsers" to config.ownerControl.ownerPanelHiddenFromNormalUsers,
            "requireFirebaseAdminClaim" to config.ownerControl.requireFirebaseAdminClaim,
            "separateOwnerRoute" to config.ownerControl.separateOwnerRoute,
            "realtimeApply" to config.ownerControl.realtimeApply,
            "changeLogEnabled" to config.ownerControl.changeLogEnabled,
            "rollbackEnabled" to config.ownerControl.rollbackEnabled,
            "editableValues" to config.ownerControl.editableValues
        )
    )

    private fun encodeFeatureAccess(value: FeatureAccess): Map<String, Any?> = mapOf(
        "enabled" to value.enabled,
        "maxDurationSeconds" to value.maxDurationSeconds,
        "priority" to value.priority
    )

    private fun encodePlan(plan: PlanDefinition): Map<String, Any> = mapOf(
        "id" to plan.id,
        "displayName" to plan.displayName,
        "manuallyApproved" to plan.manuallyApproved,
        "enabledFeatures" to plan.enabledFeatures.map { it.name },
        "featureLimitsSeconds" to plan.featureLimitsSeconds.mapKeys { it.key.name }
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
            dataDeleteEnabled = data["dataDeleteEnabled"] as? Boolean ?: true,
            masterConfig = decodeMasterConfig(data["masterConfig"] as? Map<*, *>)
        )
    }

    private fun decodeMasterConfig(value: Map<*, *>?): MasterControlConfig {
        val root = value ?: return MasterControlConfig()
        val app = map(root["app"])
        val permissions = map(root["permissions"])
        val access = map(root["access"])
        val plans = map(root["plans"])
        val connection = map(root["connection"])
        val notifications = map(root["notifications"])
        val content = map(root["content"])
        val security = map(root["security"])
        val support = map(root["support"])
        val ownerControl = map(root["ownerControl"])

        return MasterControlConfig(
            app = MasterControlConfig().app.copy(
                appName = app["appName"]?.toString() ?: MasterControlConfig().app.appName,
                shortName = app["shortName"]?.toString() ?: MasterControlConfig().app.shortName,
                logoResourceName = app["logoResourceName"]?.toString(),
                themeKey = app["themeKey"]?.toString() ?: "default",
                primaryColor = app["primaryColor"]?.toString(),
                secondaryColor = app["secondaryColor"]?.toString()
            ),
            permissions = MasterControlConfig().permissions.copy(
                mode = runCatching { PermissionMode.valueOf(permissions["mode"]?.toString() ?: "") }
                    .getOrDefault(PermissionMode.ONE_BY_ONE),
                showFeatureExplanation = permissions["showFeatureExplanation"] as? Boolean ?: true,
                showLiveIndicator = permissions["showLiveIndicator"] as? Boolean ?: true,
                allowUserDenyIndividualFeature = permissions["allowUserDenyIndividualFeature"] as? Boolean ?: true,
                displayOrder = featureIds(permissions["displayOrder"]),
                copy = decodePermissionText(permissions["copy"])
            ),
            access = MasterControlConfig().access.copy(
                globalEnabled = access["globalEnabled"] as? Boolean ?: true,
                globalFeatureOverrides = decodeFeatureAccessMap(access["globalFeatureOverrides"]),
                perUser = decodeUserAccessMap(access["perUser"])
            ),
            plans = MasterControlConfig().plans.copy(
                freePlanVisibleInPublicMenu = plans["freePlanVisibleInPublicMenu"] as? Boolean ?: false,
                freePlan = decodePlan(map(plans["freePlan"])) ?: MasterControlConfig().plans.freePlan,
                plans = decodePlans(plans["plans"])
            ),
            connection = MasterControlConfig().connection.copy(
                pairingRequired = connection["pairingRequired"] as? Boolean ?: true,
                persistentPairing = connection["persistentPairing"] as? Boolean ?: true,
                reconnectOnNetworkChange = connection["reconnectOnNetworkChange"] as? Boolean ?: true,
                reconnectAfterProcessRestart = connection["reconnectAfterProcessRestart"] as? Boolean ?: true,
                foregroundServicePreferred = connection["foregroundServicePreferred"] as? Boolean ?: true,
                sessionApprovalRequired = connection["sessionApprovalRequired"] as? Boolean ?: true,
                sessionExpirySeconds = (connection["sessionExpirySeconds"] as? Number)?.toLong() ?: 3600L
            ),
            notifications = MasterControlConfig().notifications.copy(
                pushEnabled = notifications["pushEnabled"] as? Boolean ?: true,
                emailEnabled = notifications["emailEnabled"] as? Boolean ?: false,
                smsEnabled = notifications["smsEnabled"] as? Boolean ?: false,
                showActiveSessionNotification = notifications["showActiveSessionNotification"] as? Boolean ?: true,
                showPermissionRevokedAlert = notifications["showPermissionRevokedAlert"] as? Boolean ?: true,
                showConnectionState = notifications["showConnectionState"] as? Boolean ?: true
            ),
            content = MasterControlConfig().content.copy(
                supportText = content["supportText"]?.toString() ?: "WhatsApp Support",
                privacyText = content["privacyText"]?.toString() ?: "Privacy and consent controls",
                termsText = content["termsText"]?.toString() ?: "Terms and conditions",
                permissionIntroText = content["permissionIntroText"]?.toString()
                    ?: "Choose which features you want to allow.",
                stopText = content["stopText"]?.toString() ?: "Stop / Disconnect",
                links = stringMap(content["links"])
            ),
            security = MasterControlConfig().security.copy(
                requireAuthenticatedController = security["requireAuthenticatedController"] as? Boolean ?: true,
                requireAuthenticatedClient = security["requireAuthenticatedClient"] as? Boolean ?: true,
                requireTwoFactorForAdmin = security["requireTwoFactorForAdmin"] as? Boolean ?: true,
                requireOtpForSensitiveAuth = security["requireOtpForSensitiveAuth"] as? Boolean ?: true,
                consentAuditEnabled = security["consentAuditEnabled"] as? Boolean ?: true,
                appLayerEncryptionEnabled = security["appLayerEncryptionEnabled"] as? Boolean ?: true,
                encryptionAlgorithm = security["encryptionAlgorithm"]?.toString() ?: "AES-256-GCM"
            ),
            support = MasterControlConfig().support.copy(
                enabled = support["enabled"] as? Boolean ?: true,
                publicNumber = support["publicNumber"]?.toString(),
                showOwnerIdentityToClient = support["showOwnerIdentityToClient"] as? Boolean ?: false
            ),
            ownerControl = OwnerControlConfig(
                ownerRole = ownerControl["ownerRole"]?.toString() ?: "OWNER",
                ownerPanelHiddenFromNormalUsers = ownerControl["ownerPanelHiddenFromNormalUsers"] as? Boolean ?: true,
                requireFirebaseAdminClaim = ownerControl["requireFirebaseAdminClaim"] as? Boolean ?: true,
                separateOwnerRoute = ownerControl["separateOwnerRoute"] as? Boolean ?: true,
                realtimeApply = ownerControl["realtimeApply"] as? Boolean ?: true,
                changeLogEnabled = ownerControl["changeLogEnabled"] as? Boolean ?: true,
                rollbackEnabled = ownerControl["rollbackEnabled"] as? Boolean ?: true,
                editableValues = stringMap(ownerControl["editableValues"]).ifEmpty { OwnerControlConfig.defaultEditableValues() }
            )
        )
    }

    private fun decodePermissionText(value: Any?): Map<FeatureId, PermissionText> =
        (value as? Map<*, *>).orEmpty().mapNotNull { (key, raw) ->
            val id = runCatching { FeatureId.valueOf(key.toString()) }.getOrNull() ?: return@mapNotNull null
            val map = raw as? Map<*, *> ?: return@mapNotNull null
            id to PermissionText(
                title = map["title"]?.toString() ?: id.name,
                explanation = map["explanation"]?.toString() ?: "",
                iconKey = map["iconKey"]?.toString()
            )
        }.toMap()

    private fun decodeFeatureAccessMap(value: Any?): Map<FeatureId, FeatureAccess> =
        (value as? Map<*, *>).orEmpty().mapNotNull { (key, raw) ->
            val id = runCatching { FeatureId.valueOf(key.toString()) }.getOrNull() ?: return@mapNotNull null
            id to decodeFeatureAccess(raw)
        }.toMap()

    private fun decodeFeatureAccess(raw: Any?): FeatureAccess {
        val map = raw as? Map<*, *> ?: return FeatureAccess()
        return FeatureAccess(
            enabled = map["enabled"] as? Boolean ?: true,
            maxDurationSeconds = (map["maxDurationSeconds"] as? Number)?.toLong(),
            priority = (map["priority"] as? Number)?.toInt() ?: 0
        )
    }

    private fun decodeUserAccessMap(value: Any?): Map<String, UserFeatureAccess> =
        (value as? Map<*, *>).orEmpty().mapNotNull { (key, raw) ->
            val map = raw as? Map<*, *> ?: return@mapNotNull null
            key.toString() to UserFeatureAccess(
                enabled = map["enabled"] as? Boolean ?: true,
                planId = map["planId"]?.toString(),
                featureOverrides = decodeFeatureAccessMap(map["featureOverrides"])
            )
        }.toMap()

    private fun decodePlan(value: Map<*, *>?): PlanDefinition? {
        value ?: return null
        val id = value["id"]?.toString() ?: return null
        val enabled = (value["enabledFeatures"] as? List<*>).orEmpty().mapNotNull {
            runCatching { FeatureId.valueOf(it.toString()) }.getOrNull()
        }.toSet()
        val limits = (value["featureLimitsSeconds"] as? Map<*, *>).orEmpty().mapNotNull { (key, raw) ->
            val feature = runCatching { FeatureId.valueOf(key.toString()) }.getOrNull() ?: return@mapNotNull null
            val seconds = (raw as? Number)?.toLong() ?: return@mapNotNull null
            feature to seconds
        }.toMap()
        return PlanDefinition(
            id = id,
            displayName = value["displayName"]?.toString() ?: id,
            manuallyApproved = value["manuallyApproved"] as? Boolean ?: false,
            enabledFeatures = enabled,
            featureLimitsSeconds = limits
        )
    }

    private fun decodePlans(value: Any?): List<PlanDefinition> =
        (value as? List<*>).orEmpty().mapNotNull { decodePlan(it as? Map<*, *>) }

    private fun featureIds(value: Any?): List<FeatureId> {
        val decoded = (value as? List<*>).orEmpty().mapNotNull {
            runCatching { FeatureId.valueOf(it.toString()) }.getOrNull()
        }
        return if (decoded.isEmpty()) FeatureId.values().toList() else decoded.distinct()
    }

    private fun map(value: Any?): Map<*, *> = value as? Map<*, *> ?: emptyMap<Any, Any>()

    private fun stringMap(value: Any?): Map<String, String> =
        (value as? Map<*, *>).orEmpty().mapNotNull { (key, raw) ->
            if (key == null || raw == null) null else key.toString() to raw.toString()
        }.toMap()

    companion object {
        private const val MasterControlConfigVersion = "1.0"
        private val featureIds = FeatureId.values().toList()
    }
}
