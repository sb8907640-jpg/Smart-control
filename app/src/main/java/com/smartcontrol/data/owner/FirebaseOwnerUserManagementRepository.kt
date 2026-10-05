package com.smartcontrol.data.owner

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import com.smartcontrol.domain.owner.OwnerManagedUser
import com.smartcontrol.domain.owner.OwnerUserManagementRepository
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FirebaseOwnerUserManagementRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val functions: FirebaseFunctions
) : OwnerUserManagementRepository {

    private fun requireAdmin() {
        check(auth.currentUser != null) { "Sign in first." }
    }

    override suspend fun listUsers(): Result<List<OwnerManagedUser>> = runCatching {
        requireAdmin()
        val result = functions.getHttpsCallable("listOwnerUsers").call().await()
        val data = result.getData() as? Map<*, *> ?: emptyMap<Any, Any>()
        val users = data["users"] as? List<*> ?: emptyList<Any>()
        users.mapNotNull { raw ->
            val item = raw as? Map<*, *> ?: return@mapNotNull null
            val uid = item["uid"]?.toString()?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            OwnerManagedUser(
                uid = uid,
                displayName = item["displayName"]?.toString() ?: "",
                email = item["email"]?.toString() ?: "",
                phoneNumber = item["phoneNumber"]?.toString() ?: "",
                disabled = item["disabled"] as? Boolean ?: false,
                role = item["role"]?.toString() ?: "USER",
                admin = item["admin"] as? Boolean ?: false,
                accessGranted = item["accessGranted"] as? Boolean ?: false,
                accessExpiresAtEpochMs = (item["accessExpiresAtEpochMs"] as? Number)?.toLong()
            )
        }.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.displayName.ifBlank { it.email.ifBlank { it.uid } } })
    }

    override suspend fun setUserAccess(
        uid: String,
        role: String,
        accessGranted: Boolean,
        accessExpiresAtEpochMs: Long?
    ): Result<Unit> = runCatching {
        requireAdmin()
        functions.getHttpsCallable("updateOwnerUser").call(
            mapOf(
                "uid" to uid,
                "action" to "set",
                "role" to role,
                "access" to accessGranted,
                "accessExpiresAtEpochMs" to (accessExpiresAtEpochMs ?: 0L)
            )
        ).await()
    }

    override suspend fun setUserBlocked(uid: String, blocked: Boolean): Result<Unit> = runCatching {
        requireAdmin()
        functions.getHttpsCallable("updateOwnerUser").call(
            mapOf(
                "uid" to uid,
                "action" to if (blocked) "block" else "unblock"
            )
        ).await()
    }
}
