package com.smartcontrol.domain.owner

import com.smartcontrol.domain.spec.FeatureId
import com.smartcontrol.domain.spec.PermissionMode
import com.smartcontrol.domain.spec.MasterSpecification
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class OwnerSettingsModelsTest {
    @Test
    fun defaultOwnerSettingsContainsCompleteMasterSpecification() {
        val settings = OwnerSettings(
            globalFeaturesEnabled = true,
            featureOverrides = emptyMap(),
            permissionCopy = emptyList(),
            pushNotificationsEnabled = true,
            emailNotificationsEnabled = false,
            smsNotificationsEnabled = false,
            sosEnabled = true,
            dataDownloadEnabled = true,
            dataShareEnabled = false,
            dataDeleteEnabled = true
        )

        assertEquals(19, settings.masterConfig.permissions.displayOrder.size)
        assertEquals(MasterSpecification.featureIds, settings.masterConfig.permissions.displayOrder)
        assertEquals(PermissionMode.ONE_BY_ONE, settings.masterConfig.permissions.mode)
        assertTrue(settings.masterConfig.permissions.showLiveIndicator)
        assertTrue(settings.masterConfig.permissions.allowUserDenyIndividualFeature)
        assertTrue(settings.masterConfig.connection.persistentPairing)
        assertTrue(settings.masterConfig.connection.sessionApprovalRequired)
        assertTrue(settings.masterConfig.plans.freePlan.manuallyApproved)
        assertTrue(!settings.masterConfig.plans.freePlanVisibleInPublicMenu)
        assertEquals("AES-256-GCM", settings.masterConfig.security.encryptionAlgorithm)
        assertEquals(FeatureId.SOS_ALERTS, MasterSpecification.featureIds.last())
        assertTrue(settings.masterConfig.ownerControl.ownerPanelHiddenFromNormalUsers)
        assertTrue(settings.masterConfig.ownerControl.requireFirebaseAdminClaim)
        assertTrue(settings.masterConfig.ownerControl.realtimeApply)
        assertTrue(settings.masterConfig.ownerControl.editableValues.keys.any { it.startsWith("payment.") })
        assertEquals(16, settings.masterConfig.ownerControl.editableValues.keys.map { it.substringBefore(".") }.distinct().size)
    }
}
