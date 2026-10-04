package com.smartcontrol.domain.audit

data class ConsentAuditEvent(
    val eventId: String,
    val userId: String,
    val deviceId: String,
    val feature: String,
    val action: String,
    val sessionId: String?,
    val createdAtEpochMs: Long,
    val metadata: Map<String, String> = emptyMap()
)

interface AuditRepository {
    suspend fun append(event: ConsentAuditEvent): Result<Unit>
    suspend fun list(deviceId: String, limit: Int): List<ConsentAuditEvent>
}
