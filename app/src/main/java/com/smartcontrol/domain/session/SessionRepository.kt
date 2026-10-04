package com.smartcontrol.domain.session
import kotlinx.coroutines.flow.Flow
interface SessionRepository {
    val pendingRequests: Flow<List<SessionRequest>>
    val activeSession: Flow<RemoteSession?>
    suspend fun requestSession(request: SessionRequest)
    suspend fun approve(requestId: String)
    suspend fun deny(requestId: String)
    suspend fun stopActiveSession()
}
