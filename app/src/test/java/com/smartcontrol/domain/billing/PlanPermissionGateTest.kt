package com.smartcontrol.domain.billing

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlanPermissionGateTest {
    @Test
    fun freeGrantExpiresAndRevocationBlocksAccess() {
        val now = 1_000_000L
        val gate = PlanPermissionGate { now }
        val grant = FreeGrant(
            id = "g1",
            userId = "u1",
            grantedByOwnerId = "owner",
            planId = "free",
            startsAtEpochMs = now - 1_000L,
            expiresAtEpochMs = now + 1_000L,
            revokedAtEpochMs = null,
            featureIds = setOf("LOCATION")
        )
        assertTrue(gate.isFreeGrantFeatureAllowed(grant, "LOCATION"))
        assertFalse(gate.isFreeGrantFeatureAllowed(grant, "CAMERA"))
        assertFalse(gate.isFreeGrantFeatureAllowed(grant.copy(expiresAtEpochMs = now), "LOCATION"))
        assertFalse(gate.isFreeGrantFeatureAllowed(grant.copy(revokedAtEpochMs = now - 1), "LOCATION"))
    }

    @Test
    fun enabledPlanControlsFeatureEntitlement() {
        val gate = PlanPermissionGate { 1_000L }
        val plan = Plan(
            id = "premium",
            name = "Premium",
            description = "",
            priceMinor = 99900L,
            durationDays = 30,
            enabled = true,
            featureIds = setOf("LOCATION", "CAMERA"),
            deviceLimit = 1,
            userLimit = 1,
            storageLimitBytes = 0L,
            bandwidthLimitBytes = 0L
        )
        assertTrue(gate.isPlanFeatureAllowed(plan, "CAMERA"))
        assertFalse(gate.isPlanFeatureAllowed(plan, "SMS"))
        assertFalse(gate.isPlanFeatureAllowed(plan.copy(enabled = false), "CAMERA"))
    }
}
