package com.smartcontrol.domain.session
enum class SessionCapability { CAMERA, MICROPHONE, SCREEN_SHARING, LOCATION, FILE_TRANSFER, REMOTE_CONTROL }
enum class SessionStatus { REQUESTED, APPROVED, ACTIVE, STOPPED, DENIED }
data class SessionRequest(
    val sessionId: String,
    val requesterId: String,
    val targetDeviceId: String,
    val capabilities: Set<SessionCapability>,
    val reason: String,
    val createdAtEpochMs: Long
)
data class RemoteSession(val request: SessionRequest, val status: SessionStatus)
