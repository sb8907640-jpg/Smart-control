package com.smartcontrol.presentation.compat

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

object BackgroundExecutionGuidance {
    fun isIgnoringBatteryOptimizations(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= 23) {
            context.getSystemService(PowerManager::class.java)
                ?.isIgnoringBatteryOptimizations(context.packageName) == true
        } else true

    fun openBatteryOptimizationSettings(context: Context) {
        runCatching {
            context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    fun manufacturerGuidance(): String = when (Build.MANUFACTURER.lowercase()) {
        "xiaomi" -> "Xiaomi/MIUI: allow background activity and set Battery saver to No restrictions."
        "oppo" -> "OPPO/ColorOS: allow auto-launch and set battery usage to unrestricted."
        "vivo" -> "vivo/Funtouch OS: allow auto-start and set battery usage to unrestricted."
        "oneplus" -> "OnePlus: allow background activity and disable battery optimization for this app."
        "samsung" -> "Samsung: set battery usage to Unrestricted if persistent sessions are required."
        else -> "If Android or the device vendor restricts background work, set this app to Unrestricted battery usage."
    }
}
