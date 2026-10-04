package com.smartcontrol.data.media

import com.smartcontrol.BuildConfig
import com.smartcontrol.domain.media.IceServerConfig

/**
 * Test/staging provider.
 * Production should replace this with short-lived TURN credentials from a
 * trusted backend (Twilio/Metered/coturn). Never commit long-lived secrets.
 */
object IceServerProvider {
    fun current(): List<IceServerConfig> {
        val urls = BuildConfig.TURN_URLS.split(',').map { it.trim() }.filter { it.isNotEmpty() }
        if (urls.isEmpty()) return listOf(IceServerConfig(listOf("stun:stun.l.google.com:19302")))
        return listOf(IceServerConfig(
            urls = urls,
            username = BuildConfig.TURN_USERNAME.ifBlank { null },
            credential = BuildConfig.TURN_CREDENTIAL.ifBlank { null }
        ))
    }
}
