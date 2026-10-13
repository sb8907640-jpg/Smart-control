package com.smartcontrol.domain.pairing

data class PairingCode(
    val token: String,
    val deviceUid: String,
    val expiresAtEpochMs: Long,
    val senderRole: String = "Other",
    val receiverRole: String = "Other",
    val lastHeartbeatAtEpochMs: Long? = null
)
data class PairedDevice(
    val deviceUid: String,
    val controllerUid: String,
    val createdAtEpochMs: Long,
    val active: Boolean,
    val senderRole: String = "Other",
    val receiverRole: String = "Other"
)
