package com.smartcontrol.domain.safety

data class SafetyAlert(
    val alertId: String,
    val deviceId: String,
    val type: String,
    val message: String,
    val createdAtEpochMs: Long,
    val acknowledged: Boolean = false
)

interface SafetyAlertRepository {
    suspend fun create(alert: SafetyAlert): Result<Unit>
    suspend fun acknowledge(alertId: String): Result<Unit>
    suspend fun observe(deviceId: String): kotlinx.coroutines.flow.Flow<List<SafetyAlert>>
}
