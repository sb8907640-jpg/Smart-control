package com.smartcontrol.domain.control

import com.smartcontrol.domain.session.RemoteSession
import com.smartcontrol.domain.session.SessionCapability
import com.smartcontrol.domain.session.SessionStatus

/**
 * Safety boundary for remote-command delivery.
 *
 * This component deliberately stops at command validation. It does not inject
 * touch, keyboard, or other input into the device. Commands are accepted only
 * while the exact approved media/session is active and before the command
 * expires.
 */
class RemoteCommandSessionGate(
    private val nowEpochMs: () -> Long = { System.currentTimeMillis() }
) {
    fun accept(
        command: RemoteCommand,
        activeSessionId: String?,
        accessibilityEnabled: Boolean
    ): Result<RemoteCommand> {
        if (activeSessionId == null || activeSessionId != command.sessionId) {
            return Result.failure(IllegalStateException("No matching active session."))
        }

        if (command.targetDeviceId.isBlank() || command.requesterId.isBlank()) {
            return Result.failure(IllegalArgumentException("Invalid command identity."))
        }

        if (command.expiresAtEpochMs <= nowEpochMs()) {
            return Result.failure(IllegalStateException("Remote command expired."))
        }

        if (!accessibilityEnabled) {
            return Result.failure(IllegalStateException("Accessibility capability is not enabled."))
        }

        return Result.success(command)
    }

    /**
     * Session-level authorization used before a remote feature command is
     * dispatched. APPROVED is accepted as the transition state; ACTIVE is
     * required once command delivery is actually started.
     *
     * This method never requests, grants, or bypasses Android permissions.
     */
    fun isAllowed(
        session: RemoteSession?,
        capability: SessionCapability,
        grantedCapabilities: Set<SessionCapability>,
        visibleIndicatorActive: Boolean,
    ): Boolean {
        if (session == null) return false

        val approvedSession =
            session.status == SessionStatus.APPROVED ||
                session.status == SessionStatus.ACTIVE

        if (!approvedSession) return false
        if (!session.request.capabilities.contains(capability)) return false
        if (!grantedCapabilities.contains(capability)) return false
        if (!visibleIndicatorActive) return false

        return true
    }
}
