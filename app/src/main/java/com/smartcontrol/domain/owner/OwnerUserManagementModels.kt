package com.smartcontrol.domain.owner

data class OwnerManagedUser(
    val uid: String,
    val displayName: String = "",
    val email: String = "",
    val phoneNumber: String = "",
    val disabled: Boolean = false,
    val role: String = "USER",
    val admin: Boolean = false,
    val accessGranted: Boolean = false,
    val accessExpiresAtEpochMs: Long? = null
)

interface OwnerUserManagementRepository {
    suspend fun listUsers(): Result<List<OwnerManagedUser>>
    suspend fun setUserAccess(
        uid: String,
        role: String,
        accessGranted: Boolean,
        accessExpiresAtEpochMs: Long?
    ): Result<Unit>
    suspend fun setUserBlocked(uid: String, blocked: Boolean): Result<Unit>
}
