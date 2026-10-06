package com.smartcontrol.data.offline

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.wifi.p2p.WifiP2pConfig
import android.net.wifi.p2p.WifiP2pDevice
import android.net.wifi.p2p.WifiP2pManager
import android.os.Build
import android.os.Looper
import androidx.core.content.ContextCompat
import java.io.Closeable

class WifiDirectTransport(private val context: Context) : Closeable {
    private val manager = context.getSystemService(WifiP2pManager::class.java)
        ?: error("Wi-Fi Direct is not available on this device.")
    private val channel = manager.initialize(context, Looper.getMainLooper(), null)

    fun discoverPeers(onResult: (Result<Unit>) -> Unit) {
        requireDiscoveryPermission()
        manager.discoverPeers(channel, object : WifiP2pManager.ActionListener {
            override fun onSuccess() = onResult(Result.success(Unit))
            override fun onFailure(reason: Int) =
                onResult(Result.failure(IllegalStateException("Wi-Fi Direct discovery failed: $reason")))
        })
    }

    fun requestPeers(onPeers: (List<WifiP2pDevice>) -> Unit) {
        requireDiscoveryPermission()
        manager.requestPeers(channel) { list ->
            onPeers(list.deviceList.toList())
        }
    }

    fun connect(device: WifiP2pDevice, onResult: (Result<Unit>) -> Unit) {
        requireDiscoveryPermission()
        val config = WifiP2pConfig().apply {
            deviceAddress = device.deviceAddress
        }
        manager.connect(channel, config, object : WifiP2pManager.ActionListener {
            override fun onSuccess() = onResult(Result.success(Unit))
            override fun onFailure(reason: Int) =
                onResult(Result.failure(IllegalStateException("Wi-Fi Direct connection failed: $reason")))
        })
    }

    private fun requireDiscoveryPermission() {
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
