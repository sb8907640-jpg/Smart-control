package com.smartcontrol.data.media

import com.smartcontrol.domain.media.IceServerConfig

/**
 * Safe fallback only. Production media sessions obtain short-lived ICE/TURN
 * credentials from the authenticated Firebase callable in MediaSessionViewModel.
 * Do not place TURN credentials in BuildConfig or the APK.
 */
object IceServerProvider {
    fun current(): List<IceServerConfig> =
        listOf(IceServerConfig(listOf("stun:stun.l.google.com:19302")))
}
