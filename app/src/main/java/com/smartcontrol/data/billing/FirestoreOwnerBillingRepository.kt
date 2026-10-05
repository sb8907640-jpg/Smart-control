package com.smartcontrol.data.billing

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.firebase.functions.FirebaseFunctions
import com.smartcontrol.domain.billing.FreeGrant
import com.smartcontrol.domain.billing.Plan
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

data class OwnerProfile(
    val displayName: String = "",
    val emails: List<String> = emptyList(),
    val mobiles: List<String> = emptyList(),
    val supportWhatsApp: String = "",
    val hiddenLoginPath: String = "",
    val updatedAtEpochMs: Long = 0L
)

interface OwnerBillingRepository {
    suspend fun isAdmin(): Boolean
    suspend fun getOwnerProfile(): OwnerProfile
    suspend fun saveOwnerProfile(profile: OwnerProfile): Result<Unit>
    fun observePlans(): Flow<List<Plan>>
    suspend fun savePlan(plan: Plan): Result<Unit>
    suspend fun deletePlan(planId: String): Result<Unit>
    fun observeFreeGrants(): Flow<List<FreeGrant>>
    suspend fun grantFreeAccess(grant: FreeGrant): Result<Unit>
    suspend fun updateFreeAccess(grant: FreeGrant): Result<Unit>
    suspend fun revokeFreeAccess(grant: FreeGrant): Result<Unit>
}

@Singleton
class FirestoreOwnerBillingRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore,
    private val functions: FirebaseFunctions
) : OwnerBillingRepository {

    override suspend fun isAdmin(): Boolean =
        auth.currentUser?.getIdToken(false)?.await()?.claims?.get("admin") == true

    override suspend fun getOwnerProfile(): OwnerProfile {
        check(isAdmin()) { "Admin role required." }
        val data = firestore.collection("ownerAccounts").document("config").get().await().data.orEmpty()
        return decodeOwnerProfile(data)
    }

    override suspend fun saveOwnerProfile(profile: OwnerProfile): Result<Unit> = runCatching {
        check(isAdmin()) { "Admin role required." }
        require(profile.emails.isNotEmpty() || profile.mobiles.isNotEmpty()) {
            "At least one owner email or mobile is required."
        }
        val normalizedEmails = profile.emails.map { it.trim().lowercase() }.filter { it.isNotBlank() }.distinct()
        val normalizedMobiles = profile.mobiles.map { it.trim() }.filter { it.isNotBlank() }.distinct()
        require(normalizedEmails.all { it.contains("@") }) { "Owner email format is invalid." }
        require(normalizedMobiles.all { it.startsWith("+") }) { "Owner mobile must use international format." }

        firestore.collection("ownerAccounts").document("config")
            .set(
                mapOf(
                    "displayName" to profile.displayName,
                    "emails" to normalizedEmails,
                    "mobiles" to normalizedMobiles,
                    "supportWhatsApp" to profile.supportWhatsApp,
                    "hiddenLoginPath" to profile.hiddenLoginPath,
                    "updatedAtEpochMs" to System.currentTimeMillis()
                ),
                SetOptions.merge()
            ).await()

        functions.getHttpsCallable("syncOwnerAccounts")
            .call(mapOf("emails" to normalizedEmails, "mobiles" to normalizedMobiles))
            .await()
    }

    override fun observePlans(): Flow<List<Plan>> = callbackFlow {
        val registration = firestore.collection("plans")
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(snapshot?.documents.orEmpty().mapNotNull { doc -> decodePlan(doc.id, doc.data) }
                    .sortedBy { it.displayOrder })
            }
        awaitClose { registration.remove() }
    }

    override suspend fun savePlan(plan: Plan): Result<Unit> = runCatching {
        check(isAdmin()) { "Admin role required." }
        require(plan.id.isNotBlank()) { "Plan ID is required." }
        firestore.collection("plans").document(plan.id).set(encodePlan(plan) + mapOf(
            "publicVisible" to plan.enabled,
            "updatedAtEpochMs" to System.currentTimeMillis()
        ), SetOptions.merge()).await()
    }

    override suspend fun deletePlan(planId: String): Result<Unit> = runCatching {
        check(isAdmin()) { "Admin role required." }
        require(planId.isNotBlank()) { "Plan ID is required." }
        firestore.collection("plans").document(planId).delete().await()
    }

    override fun observeFreeGrants(): Flow<List<FreeGrant>> = callbackFlow {
        val registration = firestore.collection("freeAccessGrants")
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(snapshot?.documents.orEmpty().mapNotNull { doc ->
                    decodeGrant(doc.id, doc.data)
                }.sortedBy { it.expiresAtEpochMs })
            }
        awaitClose { registration.remove() }
    }

    override suspend fun grantFreeAccess(grant: FreeGrant): Result<Unit> =
        runCatching {
            check(isAdmin()) { "Admin role required." }
            validateGrant(grant)
            firestore.collection("freeAccessGrants").document(grant.id)
                .set(encodeGrant(grant), SetOptions.merge()).await()
        }

    override suspend fun updateFreeAccess(grant: FreeGrant): Result<Unit> =
        runCatching {
            check(isAdmin()) { "Admin role required." }
            validateGrant(grant)
            firestore.collection("freeAccessGrants").document(grant.id)
                .set(encodeGrant(grant.copy(updatedAtEpochMs = System.currentTimeMillis())), SetOptions.merge()).await()
        }

    override suspend fun revokeFreeAccess(grant: FreeGrant): Result<Unit> =
        runCatching {
            check(isAdmin()) { "Admin role required." }
            firestore.collection("freeAccessGrants").document(grant.id)
                .set(
                    mapOf(
                        "revokedAtEpochMs" to System.currentTimeMillis(),
                        "updatedAtEpochMs" to System.currentTimeMillis()
                    ),
                    SetOptions.merge()
                ).await()
        }

    private fun validateGrant(grant: FreeGrant) {
        require(grant.id.isNotBlank()) { "Grant ID is required." }
        require(grant.userId.isNotBlank()) { "User ID is required." }
        require(grant.startsAtEpochMs < grant.expiresAtEpochMs) { "Start must be before expiry." }
        require(grant.deviceLimit > 0) { "Device limit must be positive." }
    }

    private fun encodePlan(plan: Plan): Map<String, Any?> = mapOf(
        "name" to plan.name,
        "description" to plan.description,
        "tagline" to plan.tagline,
        "iconKey" to plan.iconKey,
        "badge" to plan.badge,
        "priceMinor" to plan.priceMinor,
        "currency" to plan.currency,
        "durationDays" to plan.durationDays,
        "durationUnit" to plan.durationUnit,
        "durationValue" to plan.durationValue,
        "enabled" to plan.enabled,
        "featureIds" to plan.featureIds.toList(),
        "deviceLimit" to plan.deviceLimit,
        "userLimit" to plan.userLimit,
        "storageLimitBytes" to plan.storageLimitBytes,
        "bandwidthLimitBytes" to plan.bandwidthLimitBytes,
        "autoRenew" to plan.autoRenew,
        "gracePeriodDays" to plan.gracePeriodDays,
        "expiryReminderDays" to plan.expiryReminderDays,
        "discountPercent" to plan.discountPercent,
        "discountMinor" to plan.discountMinor,
        "taxPercent" to plan.taxPercent,
        "originalPriceMinor" to plan.originalPriceMinor,
        "offerPriceVisible" to plan.offerPriceVisible,
        "displayOrder" to plan.displayOrder,
        "tierLevel" to plan.tierLevel,
        "upgradePlanIds" to plan.upgradePlanIds.toList(),
        "downgradePlanIds" to plan.downgradePlanIds.toList(),
        "crossGradeEnabled" to plan.crossGradeEnabled
    )

    private fun decodePlan(id: String, data: Map<String, Any?>?): Plan? {
        data ?: return null
        val name = data["name"]?.toString() ?: return null
        val durationDays = (data["durationDays"] as? Number)?.toInt() ?: 30
        return Plan(
            id = id,
            name = name,
            description = data["description"]?.toString() ?: "",
            priceMinor = (data["priceMinor"] as? Number)?.toLong() ?: 0L,
            currency = data["currency"]?.toString() ?: "INR",
            durationDays = durationDays,
            enabled = data["enabled"] as? Boolean ?: true,
            featureIds = (data["featureIds"] as? List<*>)?.map { it.toString() }?.toSet().orEmpty(),
            deviceLimit = (data["deviceLimit"] as? Number)?.toInt() ?: 1,
            userLimit = (data["userLimit"] as? Number)?.toInt() ?: 1,
            storageLimitBytes = (data["storageLimitBytes"] as? Number)?.toLong() ?: 0L,
            bandwidthLimitBytes = (data["bandwidthLimitBytes"] as? Number)?.toLong() ?: 0L,
            tagline = data["tagline"]?.toString() ?: "",
            iconKey = data["iconKey"]?.toString() ?: "",
            badge = data["badge"]?.toString() ?: "",
            durationUnit = data["durationUnit"]?.toString() ?: "DAY",
            durationValue = (data["durationValue"] as? Number)?.toLong() ?: durationDays.toLong(),
            autoRenew = data["autoRenew"] as? Boolean ?: false,
            gracePeriodDays = (data["gracePeriodDays"] as? Number)?.toInt() ?: 0,
            expiryReminderDays = (data["expiryReminderDays"] as? Number)?.toInt() ?: 3,
            discountPercent = (data["discountPercent"] as? Number)?.toDouble() ?: 0.0,
            discountMinor = (data["discountMinor"] as? Number)?.toLong() ?: 0L,
            taxPercent = (data["taxPercent"] as? Number)?.toDouble() ?: 0.0,
            originalPriceMinor = (data["originalPriceMinor"] as? Number)?.toLong(),
            offerPriceVisible = data["offerPriceVisible"] as? Boolean ?: true,
            displayOrder = (data["displayOrder"] as? Number)?.toInt() ?: 0,
            tierLevel = (data["tierLevel"] as? Number)?.toInt() ?: 0,
            upgradePlanIds = (data["upgradePlanIds"] as? List<*>)?.map { it.toString() }?.toSet().orEmpty(),
            downgradePlanIds = (data["downgradePlanIds"] as? List<*>)?.map { it.toString() }?.toSet().orEmpty(),
            crossGradeEnabled = data["crossGradeEnabled"] as? Boolean ?: true
        )
    }

    private fun encodeGrant(grant: FreeGrant): Map<String, Any?> = mapOf(
        "userId" to grant.userId,
        "grantedByOwnerId" to grant.grantedByOwnerId,
        "planId" to grant.planId,
        "startsAtEpochMs" to grant.startsAtEpochMs,
        "expiresAtEpochMs" to grant.expiresAtEpochMs,
        "revokedAtEpochMs" to grant.revokedAtEpochMs,
        "userName" to grant.userName,
        "email" to grant.email,
        "mobile" to grant.mobile,
        "featureIds" to grant.featureIds.toList(),
        "deviceLimit" to grant.deviceLimit,
        "autoExpire" to grant.autoExpire,
        "createdAtEpochMs" to grant.createdAtEpochMs,
        "updatedAtEpochMs" to grant.updatedAtEpochMs
    )

    private fun decodeGrant(id: String, data: Map<String, Any?>?): FreeGrant? {
        data ?: return null
        val userId = data["userId"]?.toString() ?: return null
        return FreeGrant(
            id = id,
            userId = userId,
            grantedByOwnerId = data["grantedByOwnerId"]?.toString() ?: "",
            planId = data["planId"]?.toString() ?: "free",
            startsAtEpochMs = (data["startsAtEpochMs"] as? Number)?.toLong() ?: 0L,
            expiresAtEpochMs = (data["expiresAtEpochMs"] as? Number)?.toLong() ?: 0L,
            revokedAtEpochMs = (data["revokedAtEpochMs"] as? Number)?.toLong(),
            userName = data["userName"]?.toString() ?: "",
            email = data["email"]?.toString() ?: "",
            mobile = data["mobile"]?.toString() ?: "",
            featureIds = (data["featureIds"] as? List<*>)?.map { it.toString() }?.toSet().orEmpty(),
            deviceLimit = (data["deviceLimit"] as? Number)?.toInt() ?: 1,
            autoExpire = data["autoExpire"] as? Boolean ?: true,
            createdAtEpochMs = (data["createdAtEpochMs"] as? Number)?.toLong() ?: 0L,
            updatedAtEpochMs = (data["updatedAtEpochMs"] as? Number)?.toLong() ?: 0L
        )
    }

    private fun decodeOwnerProfile(data: Map<String, Any?>): OwnerProfile = OwnerProfile(
        displayName = data["displayName"]?.toString() ?: "",
        emails = (data["emails"] as? List<*>)?.map { it.toString() }.orEmpty(),
        mobiles = (data["mobiles"] as? List<*>)?.map { it.toString() }.orEmpty(),
        supportWhatsApp = data["supportWhatsApp"]?.toString() ?: "",
        hiddenLoginPath = data["hiddenLoginPath"]?.toString() ?: "",
        updatedAtEpochMs = (data["updatedAtEpochMs"] as? Number)?.toLong() ?: 0L
    )
}
