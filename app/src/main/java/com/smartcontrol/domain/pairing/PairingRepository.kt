package com.smartcontrol.domain.pairing

import kotlinx.coroutines.flow.Flow

interface PairingRepository {
    fun observePairing(): Flow<PairedDevice?>
    fun observeControlledDevice(): Flow<PairedDevice?>
    suspend fun createPairingCode(): Result<PairingCode>
    suspend fun claimPairingCode(token: String): Result<PairedDevice>
    suspend fun unpair(): Result<Unit>
}
