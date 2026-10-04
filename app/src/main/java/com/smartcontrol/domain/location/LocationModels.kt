package com.smartcontrol.domain.location

data class SharedLocation(
    val deviceId: String,
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float?,
    val capturedAtEpochMs: Long
)

interface LocationSharingRepository {
    suspend fun publish(location: SharedLocation)
    suspend fun stopSharing(deviceId: String)
}
