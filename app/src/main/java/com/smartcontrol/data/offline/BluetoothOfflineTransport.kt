package com.smartcontrol.data.offline

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.Closeable
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

data class BluetoothOfflineConnection(
    val socket: BluetoothSocket,
    val input: InputStream,
    val output: OutputStream
) : Closeable {
    override fun close() {
        runCatching { socket.close() }
    }
}

class BluetoothOfflineTransport(
    private val context: Context,
    private val adapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
) : Closeable {
    companion object {
        val SERVICE_UUID: UUID = UUID.fromString("b9e2b6c2-7f5b-4f1a-9f10-5e9a7c1d7d41")
    }

    private var serverSocket: BluetoothServerSocket? = null

    fun isAvailable(): Boolean = adapter != null

    fun startServer(name: String = "SmartControl"): Boolean {
        requireBluetoothPermission(Manifest.permission.BLUETOOTH_CONNECT)
        val bt = adapter ?: return false
        if (!bt.isEnabled) return false
        serverSocket?.close()
        serverSocket = bt.listenUsingRfcommWithServiceRecord(name.take(248), SERVICE_UUID)
        return true
    }

    suspend fun accept(): BluetoothOfflineConnection = withContext(Dispatchers.IO) {
        requireBluetoothPermission(Manifest.permission.BLUETOOTH_CONNECT)
        val socket = serverSocket?.accept() ?: error("Bluetooth server is not started.")
        BluetoothOfflineConnection(socket, socket.inputStream, socket.outputStream)
    }

    suspend fun connect(deviceAddress: String): BluetoothOfflineConnection = withContext(Dispatchers.IO) {
        requireBluetoothPermission(Manifest.permission.BLUETOOTH_CONNECT)
        val bt = adapter ?: error("Bluetooth is not available.")
        val device = bt.getRemoteDevice(deviceAddress)
        val socket = device.createRfcommSocketToServiceRecord(SERVICE_UUID)
        socket.connect()
        BluetoothOfflineConnection(socket, socket.inputStream, socket.outputStream)
    }

    private fun requireBluetoothPermission(permission: String) {
        if (Build.VERSION.SDK_INT >= 31) {
            check(ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED) {
                "Bluetooth permission is required before using offline transport."
            }
        }
    }

    override fun close() {
        runCatching { serverSocket?.close() }
        serverSocket = null
    }
}
