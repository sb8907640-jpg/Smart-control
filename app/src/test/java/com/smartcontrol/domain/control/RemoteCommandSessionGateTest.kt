package com.smartcontrol.domain.control

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteCommandSessionGateTest {

    private val now = 1_000L

    private fun command(
        sessionId: String = "session-1",
        requesterId: String = "requester-1",
        targetDeviceId: String = "device-1",
        expiresAtEpochMs: Long = now + 10_000L
    ) = RemoteCommand(
        sessionId = sessionId,
        requesterId = requesterId,
        targetDeviceId = targetDeviceId,
        type = RemoteCommandType.REQUEST_TOUCH,
        payload = mapOf("test" to "true"),
        createdAtEpochMs = now,
        expiresAtEpochMs = expiresAtEpochMs
    )

    @Test
    fun acceptsCommandOnlyForMatchingActiveSession() {
        val gate = RemoteCommandSessionGate { now }
        val result = gate.accept(command(), "session-1", accessibilityEnabled = true)
        assertTrue(result.isSuccess)
        assertEquals("session-1", result.getOrThrow().sessionId)
    }

    @Test
    fun rejectsMissingActiveSession() {
        val gate = RemoteCommandSessionGate { now }
        assertFalse(gate.accept(command(), null, true).isSuccess)
    }

    @Test
    fun rejectsMismatchedSession() {
        val gate = RemoteCommandSessionGate { now }
        assertFalse(gate.accept(command(), "session-2", true).isSuccess)
    }

    @Test
    fun rejectsExpiredCommand() {
        val gate = RemoteCommandSessionGate { now }
        assertFalse(gate.accept(command(expiresAtEpochMs = now), "session-1", true).isSuccess)
    }

    @Test
    fun rejectsInvalidIdentity() {
        val gate = RemoteCommandSessionGate { now }
        assertFalse(gate.accept(command(requesterId = ""), "session-1", true).isSuccess)
        assertFalse(gate.accept(command(targetDeviceId = ""), "session-1", true).isSuccess)
    }

    @Test
    fun rejectsWhenAccessibilityCapabilityIsUnavailable() {
        val gate = RemoteCommandSessionGate { now }
        assertFalse(gate.accept(command(), "session-1", accessibilityEnabled = false).isSuccess)
    }
}
