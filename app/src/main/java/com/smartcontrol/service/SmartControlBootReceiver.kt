package com.smartcontrol.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class SmartControlBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return

        val prefs = context.getSharedPreferences("smart_control_settings", Context.MODE_PRIVATE)
        val autoStart = prefs.getBoolean("auto_start_service", false)
        if (!autoStart) return

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(Intent(context, FamilySafetyService::class.java))
            } else {
                context.startService(Intent(context, FamilySafetyService::class.java))
            }
        } catch (_: SecurityException) {
            // OS/OEM policy may deny background service start; never bypass it.
        } catch (_: IllegalStateException) {
            // Background-start restrictions remain platform controlled.
        }
    }
}
