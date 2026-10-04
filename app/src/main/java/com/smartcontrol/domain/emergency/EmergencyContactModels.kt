package com.smartcontrol.domain.emergency

data class EmergencyContact(
    val contactId: String,
    val ownerUid: String,
    val name: String,
    val phoneNumber: String,
    val enabled: Boolean = true
)

interface EmergencyContactRepository {
    suspend fun list(ownerUid: String): List<EmergencyContact>
    suspend fun save(contact: EmergencyContact): Result<Unit>
    suspend fun delete(ownerUid: String, contactId: String): Result<Unit>
}
