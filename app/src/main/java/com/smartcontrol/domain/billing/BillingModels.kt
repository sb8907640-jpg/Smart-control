package com.smartcontrol.domain.billing

data class Plan(
    val id: String,
    val name: String,
    val description: String,
    val priceMinor: Long,
    val currency: String = "INR",
    val durationDays: Int,
    val enabled: Boolean,
    val featureIds: Set<String>,
    val deviceLimit: Int,
    val userLimit: Int,
    val storageLimitBytes: Long,
    val bandwidthLimitBytes: Long,
    val tagline: String = "",
    val iconKey: String = "",
    val badge: String = "",
    val durationUnit: String = "DAY",
    val durationValue: Long = durationDays.toLong(),
    val autoRenew: Boolean = false,
    val gracePeriodDays: Int = 0,
    val expiryReminderDays: Int = 3,
    val discountPercent: Double = 0.0,
    val discountMinor: Long = 0L,
    val taxPercent: Double = 0.0,
    val originalPriceMinor: Long? = null,
    val offerPriceVisible: Boolean = true,
    val displayOrder: Int = 0,
    val tierLevel: Int = 0,
    val upgradePlanIds: Set<String> = emptySet(),
    val downgradePlanIds: Set<String> = emptySet(),
    val crossGradeEnabled: Boolean = true
)

data class Subscription(
    val id: String,
    val userId: String,
    val planId: String,
    val status: Status,
    val startedAtEpochMs: Long,
    val expiresAtEpochMs: Long,
    val autoRenew: Boolean
) {
    enum class Status { TRIAL, ACTIVE, PAST_DUE, CANCELLED, EXPIRED }
}

data class Payment(
    val id: String,
    val userId: String,
    val subscriptionId: String?,
    val amountMinor: Long,
    val currency: String,
    val gateway: String,
    val gatewayReference: String?,
    val status: Status,
    val createdAtEpochMs: Long
) {
    enum class Status { CREATED, PENDING, SUCCESS, FAILED, REFUNDED }
}

data class EmiSchedule(
    val id: String,
    val paymentId: String,
    val tenureMonths: Int,
    val annualInterestBasisPoints: Int,
    val processingFeeMinor: Long,
    val downPaymentMinor: Long,
    val autoDebitRequested: Boolean,
    val status: Status
) {
    enum class Status { PENDING, ACTIVE, COMPLETED, DEFAULTED, CANCELLED }
}

data class FreeGrant(
    val id: String,
    val userId: String,
    val grantedByOwnerId: String,
    val planId: String,
    val startsAtEpochMs: Long,
    val expiresAtEpochMs: Long,
    val revokedAtEpochMs: Long?,
    val userName: String = "",
    val email: String = "",
    val mobile: String = "",
    val featureIds: Set<String> = emptySet(),
    val deviceLimit: Int = 1,
    val autoExpire: Boolean = true,
    val createdAtEpochMs: Long = System.currentTimeMillis(),
    val updatedAtEpochMs: Long = System.currentTimeMillis()
) {
    fun isActive(nowEpochMs: Long = System.currentTimeMillis()): Boolean =
        revokedAtEpochMs == null &&
            (!autoExpire || expiresAtEpochMs > nowEpochMs) &&
            startsAtEpochMs <= nowEpochMs
}

interface BillingRepository {
    suspend fun getPlans(): List<Plan>
    suspend fun getSubscription(userId: String): Subscription?
    suspend fun createPayment(payment: Payment): Result<Payment>
    suspend fun createEmiSchedule(schedule: EmiSchedule): Result<EmiSchedule>
    suspend fun grantFreeAccess(grant: FreeGrant): Result<FreeGrant>
}
