package com.smartcontrol.data.billing

import com.google.firebase.functions.FirebaseFunctions
import com.smartcontrol.domain.billing.BillingRepository
import com.smartcontrol.domain.billing.EmiSchedule
import com.smartcontrol.domain.billing.FreeGrant
import com.smartcontrol.domain.billing.Payment
import com.smartcontrol.domain.billing.Plan
import com.smartcontrol.domain.billing.Subscription
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FirebaseBillingRepository @Inject constructor(
    private val functions: FirebaseFunctions
) : BillingRepository {

    override suspend fun getPlans(): List<Plan> {
        val result = functions.getHttpsCallable("getPublicPlans").call().await()
        val data = result.data as? Map<*, *> ?: return emptyList()
        val rows = data["plans"] as? List<*> ?: return emptyList()
        return rows.mapNotNull { decodePlan(it as? Map<*, *> ?: return@mapNotNull null) }
    }

    override suspend fun getSubscription(userId: String): Subscription? {
        val result = functions.getHttpsCallable("getMySubscription")
            .call(mapOf("userId" to userId)).await()
        val data = result.data as? Map<*, *> ?: return null
        return decodeSubscription(data["subscription"] as? Map<*, *> ?: return null)
    }

    override suspend fun createPayment(payment: Payment): Result<Payment> = runCatching {
        val result = functions.getHttpsCallable("createPayment").call(
            mapOf(
                "planId" to payment.planId,
                "gateway" to payment.gateway,
                "paymentMethod" to payment.gateway
            )
        ).await()
        val data = result.data as? Map<*, *> ?: error("Invalid payment response")
        decodePayment(data["payment"] as? Map<*, *> ?: error("Missing payment"))
    }

    override suspend fun createPlanPayment(
        planId: String,
        gateway: String,
        paymentMethod: String,
        couponCode: String
    ): Result<Payment> = runCatching {
        val result = functions.getHttpsCallable("createPayment").call(
            mapOf(
                "planId" to planId,
                "gateway" to gateway,
                "paymentMethod" to paymentMethod,
                "couponCode" to couponCode
            )
        ).await()
        val data = result.data as? Map<*, *> ?: error("Invalid payment response")
        decodePayment(data["payment"] as? Map<*, *> ?: error("Missing payment"))
    }

    override suspend fun createEmiSchedule(schedule: EmiSchedule): Result<EmiSchedule> = runCatching {
        val result = functions.getHttpsCallable("applyEmi").call(
            mapOf(
                "paymentId" to schedule.paymentId,
                "tenureMonths" to schedule.tenureMonths,
                "autoDebit" to schedule.autoDebitRequested
            )
        ).await()
        val data = result.data as? Map<*, *> ?: error("Invalid EMI response")
        schedule.copy(id = data["id"]?.toString() ?: schedule.id)
    }

    override suspend fun grantFreeAccess(grant: FreeGrant): Result<FreeGrant> =
        Result.success(grant)

    private fun decodePlan(data: Map<*, *>): Plan? {
        val id = data["id"]?.toString() ?: return null
        return Plan(
            id = id,
            name = data["name"]?.toString() ?: id,
            description = data["description"]?.toString() ?: "",
            priceMinor = (data["priceMinor"] as? Number)?.toLong() ?: 0L,
            currency = data["currency"]?.toString() ?: "INR",
            durationDays = (data["durationDays"] as? Number)?.toInt() ?: 30,
            enabled = data["enabled"] as? Boolean ?: false,
            featureIds = (data["featureIds"] as? List<*>)?.map { it.toString() }?.toSet().orEmpty(),
            deviceLimit = (data["deviceLimit"] as? Number)?.toInt() ?: 1,
            userLimit = (data["userLimit"] as? Number)?.toInt() ?: 1,
            storageLimitBytes = (data["storageLimitBytes"] as? Number)?.toLong() ?: 0L,
            bandwidthLimitBytes = (data["bandwidthLimitBytes"] as? Number)?.toLong() ?: 0L
        )
    }

    private fun decodeSubscription(data: Map<*, *>): Subscription? {
        val id = data["id"]?.toString() ?: return null
        val status = runCatching {
            Subscription.Status.valueOf(data["status"]?.toString() ?: "EXPIRED")
        }.getOrDefault(Subscription.Status.EXPIRED)
        return Subscription(
            id = id,
            userId = data["userId"]?.toString() ?: "",
            planId = data["planId"]?.toString() ?: "",
            status = status,
            startedAtEpochMs = (data["startedAtEpochMs"] as? Number)?.toLong() ?: 0L,
            expiresAtEpochMs = (data["expiresAtEpochMs"] as? Number)?.toLong() ?: 0L,
            autoRenew = data["autoRenew"] as? Boolean ?: false
        )
    }

    private fun decodePayment(data: Map<*, *>): Payment {
        val status = runCatching {
            Payment.Status.valueOf(data["status"]?.toString() ?: "PENDING")
        }.getOrDefault(Payment.Status.PENDING)
        return Payment(
            id = data["id"]?.toString() ?: "",
            userId = data["userId"]?.toString() ?: "",
            subscriptionId = data["subscriptionId"]?.toString(),
            amountMinor = (data["amountMinor"] as? Number)?.toLong() ?: 0L,
            currency = data["currency"]?.toString() ?: "INR",
            gateway = data["gateway"]?.toString() ?: "TEST",
            gatewayReference = data["gatewayReference"]?.toString(),
            status = status,
            createdAtEpochMs = (data["createdAtEpochMs"] as? Number)?.toLong() ?: 0L,
            planId = data["planId"]?.toString() ?: ""
        )
    }
}
