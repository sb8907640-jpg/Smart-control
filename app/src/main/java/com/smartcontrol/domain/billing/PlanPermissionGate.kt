package com.smartcontrol.domain.billing

/**
 * Central plan/free-grant permission decision.
 *
 * It only decides entitlement. Android system permissions and visible
 * consent/session gates remain mandatory for sensitive capabilities.
 */
class PlanPermissionGate(
    private val nowEpochMs: () -> Long = { System.currentTimeMillis() }
) {
    fun isPlanFeatureAllowed(plan: Plan?, featureId: String): Boolean =
        plan != null && plan.enabled && featureId in plan.featureIds

    fun isFreeGrantFeatureAllowed(grant: FreeGrant?, featureId: String): Boolean =
        grant?.isActive(nowEpochMs()) == true &&
            (grant.featureIds.isEmpty() || featureId in grant.featureIds)

    fun effectiveFeatureAllowed(
        plan: Plan?,
        grant: FreeGrant?,
        featureId: String
    ): Boolean =
        isFreeGrantFeatureAllowed(grant, featureId) ||
            isPlanFeatureAllowed(plan, featureId)
}
