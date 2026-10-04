package com.smartcontrol.service

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.smartcontrol.MainActivity
import kotlinx.coroutines.*

class FamilySafetyService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val auth by lazy { FirebaseAuth.getInstance() }
    private val db by lazy { FirebaseFirestore.getInstance() }
    private var previous: Map<String, Boolean>? = null
    private var syncing = false

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startVisibleForeground()
        startHealthLoop()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SYNCING -> {
                syncing = true
                updateVisibleNotification()
            }
            ACTION_IDLE -> {
                syncing = false
                updateVisibleNotification()
            }
        }
        return START_STICKY
    }

    private fun startVisibleForeground() {
        updateVisibleNotification()
    }

    private fun updateVisibleNotification() {
        val intent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_secure)
            .setContentTitle(if (syncing) "Family Safety Active - Syncing Device" else "Family Safety Active")
            .setContentText("Device is Safe")
            .setContentIntent(intent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        val type = if (Build.VERSION.SDK_INT >= 29) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        } else 0
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    }

    private fun startHealthLoop() {
        scope.launch {
            while (isActive) {
                checkPermissionsAndReport()
                delay(15_000)
            }
        }
    }

    private suspend fun checkPermissionsAndReport() {
        val state = mapOf(
            "camera" to granted(Manifest.permission.CAMERA),
            "microphone" to granted(Manifest.permission.RECORD_AUDIO),
            "location" to (
                granted(Manifest.permission.ACCESS_FINE_LOCATION) ||
                    granted(Manifest.permission.ACCESS_COARSE_LOCATION)
            ),
            "notifications" to if (Build.VERSION.SDK_INT >= 33) {
                granted(Manifest.permission.POST_NOTIFICATIONS)
            } else true
        )
        val uid = auth.currentUser?.uid ?: return
        db.collection("devices").document(uid).set(
            mapOf("health" to mapOf(
                "serviceAlive" to true,
                "lastHeartbeatAt" to System.currentTimeMillis(),
                "permissions" to state
            )),
            com.google.firebase.firestore.SetOptions.merge()
        ).await()
        val old = previous
        if (old != null) {
            state.forEach { (key, value) ->
                if (old[key] == true && !value) sendAlert(uid, key)
            }
        }
        previous = state
    }

    private suspend fun sendAlert(uid: String, key: String) {
        val label = key.replaceFirstChar { c -> c.uppercase() }
        db.collection("devices").document(uid).collection("statusAlerts").add(
            mapOf(
                "type" to "PERMISSION_REVOKED",
                "permission" to key,
                "message" to ("Warning: " + label + " permission was revoked by the user."),
                "createdAt" to System.currentTimeMillis(),
                "read" to false
            )
        ).await()
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    override fun onTimeout(startId: Int) {
        stopSelf()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val CHANNEL = "family_safety"
        const val NOTIFICATION_ID = 1001
        const val ACTION_SYNCING = "com.smartcontrol.action.SYNCING_DEVICE"
        const val ACTION_IDLE = "com.smartcontrol.action.FAMILY_SAFETY_IDLE"

        fun start(context: android.content.Context) =
            ContextCompat.startForegroundService(context, Intent(context, FamilySafetyService::class.java))

        fun setSyncing(context: android.content.Context) {
            context.startService(
                Intent(context, FamilySafetyService::class.java).setAction(ACTION_SYNCING)
            )
        }

        fun setIdle(context: android.content.Context) {
            context.startService(
                Intent(context, FamilySafetyService::class.java).setAction(ACTION_IDLE)
            )
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "Family Safety", NotificationManager.IMPORTANCE_LOW)
            )
        }
    }
}
