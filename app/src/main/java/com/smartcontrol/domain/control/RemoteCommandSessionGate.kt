package com.smartcontrol.domain.control

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
}
