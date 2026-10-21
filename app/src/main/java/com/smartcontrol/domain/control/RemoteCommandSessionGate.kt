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
        activeSession: RemoteSession?,
        grantedCapabilities: Set<SessionCapability>,
        accessibilityEnabled: Boolean,
        visibleIndicatorActive: Boolean
    ): Result<RemoteCommand> {
        if (activeSession == null || activeSession.request.sessionId != command.sessionId) {
            return Result.failure(IllegalStateException("No matching active session."))
        }

        if (activeSession.request.requesterId != command.requesterId ||
            activeSession.request.targetDeviceId != command.targetDeviceId
        ) {
            return Result.failure(IllegalArgumentException("Command identity does not match the approved session."))
        }

        if (!isAllowed(
                activeSession,
                SessionCapability.REMOTE_CONTROL,
                grantedCapabilities,
                visibleIndicatorActive
            )
        ) {
            return Result.failure(IllegalStateException("Remote control is not allowed for this active session."))
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
     * Session-level authorization used immediately before a remote feature
     * command is dispatched. Only ACTIVE sessions may deliver commands; APPROVED
     * is a consent state, not an active command-delivery state.
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

        if (session.status != SessionStatus.ACTIVE) return false
        if (!session.request.capabilities.contains(capability)) return false
        if (!grantedCapabilities.contains(capability)) return false
        if (!visibleIndicatorActive) return false

        return true
    }
}
