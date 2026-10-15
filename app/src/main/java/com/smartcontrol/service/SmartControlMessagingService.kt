package com.smartcontrol.service

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.smartcontrol.BuildConfig
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class SmartControlMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        registerToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Foreground messages are handled by app UI; no hidden actions are executed.
    }

    private fun registerToken(token: String) {
        val user = FirebaseAuth.getInstance().currentUser ?: return
        user.getIdToken(false).addOnSuccessListener authToken@{ result ->
            val idToken = result.token ?: return@authToken
            postToken(token, idToken)
        }
    }

    companion object {
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
            connection.outputStream.use { output ->
                output.write("""{"token":${json(token)},"platform":"android"}""".toByteArray(Charsets.UTF_8))
            }
            connection.responseCode
            connection.disconnect()
        }
    }
}

private fun json(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
