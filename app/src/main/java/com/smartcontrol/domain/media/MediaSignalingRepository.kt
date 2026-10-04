package com.smartcontrol.domain.media

import kotlinx.coroutines.flow.Flow

interface MediaSignalingRepository {
    suspend fun createSession(
        sessionId: String,
        targetDeviceId: String,
        capabilities: Set<MediaCapability>
    ): Result<MediaSession>

    fun observeSession(sessionId: String): Flow<MediaSession?>
    fun observeRemoteIceCandidates(sessionId: String): Flow<IceCandidateModel>

    suspend fun writeOffer(sessionId: String, sdp: String): Result<Unit>
    suspend fun writeAnswer(sessionId: String, sdp: String): Result<Unit>
    suspend fun addLocalIceCandidate(sessionId: String, candidate: IceCandidateModel): Result<Unit>
    suspend fun markActive(sessionId: String): Result<Unit>
    suspend fun stopSession(sessionId: String): Result<Unit>
}
