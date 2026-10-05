package com.smartcontrol.domain.spec

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MasterSpecificationTest {
    @Test
    fun containsExactlyTheMasterNineteenFeaturesInOrder() {
        assertEquals(19, MasterSpecification.featureIds.size)
        assertEquals(
            FeatureCatalog.all.map { it.id },
            MasterSpecification.featureIds
        )
        assertEquals(19, MasterSpecification.featureIds.distinct().size)
    }

    @Test
    fun defaultPermissionModeRequiresExplicitUserAction() {
        assertEquals(PermissionMode.ONE_BY_ONE, PermissionConfig().mode)
        assertTrue(PermissionConfig().allowUserDenyIndividualFeature)
        assertTrue(PermissionConfig().showLiveIndicator)
    }

    @Test
    fun persistentPairingDoesNotRemoveSessionApproval() {
        val config = ConnectionConfig()
        assertTrue(config.persistentPairing)
        assertTrue(config.sessionApprovalRequired)
    }

    @Test
    fun freePlanIsNotPublicByDefaultAndRequiresManualApproval() {
        val plan = PlanConfig()
        assertTrue(plan.freePlan.manuallyApproved)
        assertTrue(!plan.freePlanVisibleInPublicMenu)
    }
}
