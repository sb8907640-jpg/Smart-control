package com.smartcontrol.service

import com.google.firebase.auth.FirebaseAuth
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
        val base = BuildConfig.SMARTCONTROL_API_BASE_URL.trimEnd('/')
        if (base.isBlank()) return
        val user = FirebaseAuth.getInstance().currentUser ?: return
        thread(name = "smartcontrol-fcm-register") {
            runCatching {
                val idToken = user.getIdToken(false).result.token ?: return@runCatching
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
}
