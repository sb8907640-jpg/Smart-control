package com.smartcontrol.domain.recovery

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ConnectionRecoveryPolicyTest {
    private val policy = ConnectionRecoveryPolicy()

    @Test fun backoffIsBoundedAndStopsAfterMaxAttempts() {
        assertEquals(1_000L, policy.nextDelayMs(0))
        assertEquals(2_000L, policy.nextDelayMs(1))
        assertEquals(60_000L, policy.nextDelayMs(7))
        assertNull(policy.nextDelayMs(8))
    }

    @Test fun recoveryRequiresPersistedActiveLinkAndNetwork() {
        val link = PersistentLinkState("device-1", "token-1", true, 10L)
        assertTrue(policy.shouldRecover(link, true))
        assertFalse(policy.shouldRecover(link.copy(active = false), true))
        assertFalse(policy.shouldRecover(link, false))
        assertFalse(policy.shouldRecover(link.copy(pairingToken = ""), true))
    }

    @Test fun successfulRecoveryKeepsLinkPersistent() {
        val link = PersistentLinkState("device-1", "token-1", true, 10L)
        val recovered = policy.recovered(link, 20L)
        assertTrue(recovered.active)
        assertEquals("device-1", recovered.deviceId)
        assertEquals("token-1", recovered.pairingToken)
        assertEquals(20L, recovered.lastSeenAt)
        assertNotNull(policy.nextDelayMs(0))
    }
}
