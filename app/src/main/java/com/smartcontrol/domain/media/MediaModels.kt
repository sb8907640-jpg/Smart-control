package com.smartcontrol.domain.media

data class IceServerConfig(
    val urls: List<String>,
    val username: String? = null,
    val credential: String? = null
)

data class MediaSession(
    val sessionId: String,
    val controllerUid: String,
    val targetDeviceId: String,
    val capabilities: Set<MediaCapability>,
    val status: MediaSessionStatus,
    val createdAtEpochMs: Long,
    val offerSdp: String? = null,
    val answerSdp: String? = null
)

enum class MediaCapability { CAMERA, MICROPHONE, SCREEN_SHARING }
enum class MediaSessionStatus { REQUESTED, APPROVED, ACTIVE, STOPPED }

data class IceCandidateModel(
    val candidate: String,
    val sdpMid: String?,
    val sdpMLineIndex: Int?
)
