package com.smartcontrol.domain.recovery

data class PersistentLinkState(
    val deviceId: String,
    val pairingToken: String,
    val active: Boolean,
    val lastSeenAt: Long
)

class ConnectionRecoveryPolicy(
    private val maxAttempts: Int = 8,
    private val baseDelayMs: Long = 1_000L,
    private val maxDelayMs: Long = 60_000L
) {
    fun nextDelayMs(attempt: Int): Long? {
        if (attempt < 0 || attempt >= maxAttempts) return null
        val multiplier = 1L shl attempt.coerceAtMost(20)
        return (baseDelayMs * multiplier).coerceAtMost(maxDelayMs)
    }

    fun shouldRecover(link: PersistentLinkState, networkAvailable: Boolean): Boolean =
        link.active && link.deviceId.isNotBlank() && link.pairingToken.isNotBlank() && networkAvailable

    fun recovered(link: PersistentLinkState, nowMs: Long): PersistentLinkState =
        link.copy(lastSeenAt = nowMs, active = true)
}
