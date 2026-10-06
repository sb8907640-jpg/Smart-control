package com.smartcontrol.data.offline

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.wifi.p2p.WifiP2pDevice
import android.net.wifi.p2p.WifiP2pManager
import android.os.Build
import android.os.Looper
import androidx.core.content.ContextCompat
import java.io.Closeable

class WifiDirectTransport(context: Context) : Closeable {
    private val manager = context.getSystemService(WifiP2pManager::class.java)
        ?: error("Wi-Fi Direct is not available on this device.")
    private val channel = manager.initialize(context, Looper.getMainLooper(), null)

    fun discoverPeers(onResult: (Result<Unit>) -> Unit) {
        requireDiscoveryPermission(context)
        manager.discoverPeers(channel, object : WifiP2pManager.ActionListener {
            override fun onSuccess() = onResult(Result.success(Unit))
            override fun onFailure(reason: Int) =
                onResult(Result.failure(IllegalStateException("Wi-Fi Direct discovery failed: $reason")))
        })
    }

    fun requestPeers(onPeers: (List<WifiP2pDevice>) -> Unit, onFailure: (Throwable) -> Unit) {
        requireDiscoveryPermission(context)
        manager.requestPeers(channel) { list ->
            onPeers(list.deviceList.toList())
        }
    }

    private fun requireDiscoveryPermission(context: Context) {
        val hasModernPermission = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.NEARBY_WIFI_DEVICES) == PackageManager.PERMISSION_GRANTED
        val hasLegacyPermission = Build.VERSION.SDK_INT >= 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        check(hasModernPermission && hasLegacyPermission) {
            "Wi-Fi Direct discovery requires the appropriate nearby-device permission."
        }
    }

    override fun close() {
        // The Wi-Fi Direct channel is owned by the process and requires no explicit close.
    }
}
