package com.smartcontrol.domain.pairing

data class PairingCode(val token: String, val deviceUid: String, val expiresAtEpochMs: Long)
data class PairedDevice(
    val deviceUid: String,
    val controllerUid: String,
    val createdAtEpochMs: Long,
    val active: Boolean
)
