package com.smartcontrol.domain.pairing

import kotlinx.coroutines.flow.Flow

interface PairingRepository {
    fun observePairing(): Flow<PairedDevice?>
    fun observeControlledDevice(): Flow<PairedDevice?>
    fun observeControlledDevices(): Flow<List<PairedDevice>>
    suspend fun createPairingCode(senderRole: String = "Other", receiverRole: String = "Other"): Result<PairingCode>
    suspend fun claimPairingCode(token: String): Result<PairedDevice>
    suspend fun unpair(deviceUid: String? = null): Result<Unit>
}
