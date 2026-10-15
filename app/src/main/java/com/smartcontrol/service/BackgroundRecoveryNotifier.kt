package com.smartcontrol.service

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.smartcontrol.MainActivity

/**
 * Visible, user-actionable notice when Android prevents automatic background recovery.
 * This does not restart a foreground service or bypass Android's background-start rules.
 */
internal object BackgroundRecoveryNotifier {
    private const val CHANNEL_ID = "family_safety_recovery"
    private const val NOTIFICATION_ID = 1004

    fun show(context: Context, message: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Family Safety recovery", NotificationManager.IMPORTANCE_DEFAULT)
            )
        }
        val openIntent = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Family Safety needs attention")
            .setContentText(message.take(240))
            .setStyle(NotificationCompat.BigTextStyle().bigText(message.take(1000)))
            .setContentIntent(openIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        runCatching { manager.notify(NOTIFICATION_ID, notification) }
    }
}
