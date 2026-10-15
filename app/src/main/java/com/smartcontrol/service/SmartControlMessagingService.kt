package com.smartcontrol.service

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.smartcontrol.BuildConfig
import com.smartcontrol.MainActivity
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class SmartControlMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        registerToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Foreground FCM notifications are not displayed by Android automatically.
        // Show only a visible notification; no message can execute a remote action.
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val title = message.notification?.title ?: message.data["title"] ?: "Family Suraksha"
        val body = message.notification?.body ?: message.data["body"] ?: return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(MESSAGE_CHANNEL, "Family Suraksha alerts", NotificationManager.IMPORTANCE_DEFAULT)
            )
        }
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, MESSAGE_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title.take(100))
            .setContentText(body.take(500))
            .setStyle(NotificationCompat.BigTextStyle().bigText(body.take(2000)))
            .setContentIntent(openIntent)
            .setAutoCancel(true)
            .build()
        manager.notify((message.messageId ?: System.currentTimeMillis().toString()).hashCode(), notification)
    }

    private fun registerToken(token: String) {
        val user = FirebaseAuth.getInstance().currentUser ?: return
        user.getIdToken(false).addOnSuccessListener authToken@{ result ->
            val idToken = result.token ?: return@authToken
            postToken(token, idToken)
        }
    }

    companion object {
        private const val MESSAGE_CHANNEL = "family_suraksha_alerts"

        /**
         * FCM may issue its first token before the user signs in. Call this after
         * authentication so that token registration is retried for the current user.
         */
        fun registerCurrentToken() {
            FirebaseMessaging.getInstance().token.addOnSuccessListener fcmToken@{ token ->
                val user = FirebaseAuth.getInstance().currentUser ?: return@fcmToken
                user.getIdToken(false).addOnSuccessListener authToken@{ result ->
                    val idToken = result.token ?: return@authToken
                    postToken(token, idToken)
                }
            }
        }
    }
}

private fun postToken(token: String, idToken: String) {
    val base = BuildConfig.SMARTCONTROL_API_BASE_URL.trimEnd('/')
    if (base.isBlank()) return

    // This request carries a Firebase ID token. Never send it over cleartext HTTP
    // or to a URL containing embedded credentials, query parameters, or fragments.
    val parsedBase = runCatching { URL(base) }.getOrNull() ?: return
    val host = parsedBase.host.lowercase()
    val isLocalHost = host in setOf("localhost", "127.0.0.1", "::1", "[::1]")
    if (host.isBlank() || parsedBase.userInfo != null || parsedBase.query != null || parsedBase.ref != null ||
        (parsedBase.protocol != "https" && !(parsedBase.protocol == "http" && isLocalHost))
    ) return

    thread(name = "smartcontrol-fcm-register") {
        runCatching {
            val connection = (URL("$base/api/notifications/register").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10_000
                readTimeout = 10_000
                doOutput = true
                setRequestProperty("Authorization", "Bearer $idToken")
                setRequestProperty("Content-Type", "application/json")
            }
            try {
                connection.outputStream.use { output ->
                    output.write("""{"token":${json(token)},"platform":"android"}""".toByteArray(Charsets.UTF_8))
                }
                connection.responseCode
            } finally {
                connection.disconnect()
            }
        }
    }
}

private fun json(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
