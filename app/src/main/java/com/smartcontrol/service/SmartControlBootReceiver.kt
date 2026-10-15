package com.smartcontrol.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.smartcontrol.presentation.consent.CURRENT_LEGAL_CONSENT_VERSION

class SmartControlBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return

        val settings = context.getSharedPreferences("smart_control_settings", Context.MODE_PRIVATE)
        if (!settings.getBoolean("auto_start_service", false)) return

        // A boot broadcast must not bypass the consent and onboarding gates enforced by
        // MainActivity. If consent is missing, outdated, or only partially recorded,
        // leave the service stopped until the user opens the app and completes setup.
        val consent = context.getSharedPreferences("legal_consent", Context.MODE_PRIVATE)
        val consentValid =
            consent.getBoolean("accepted", false) &&
                consent.getInt("accepted_version", 0) == CURRENT_LEGAL_CONSENT_VERSION &&
                consent.getBoolean("device_owner_consent", false) &&
                consent.getBoolean("privacy_consent", false) &&
                consent.getBoolean("eula_consent", false) &&
                consent.getLong("accepted_at_epoch_ms", 0L) > 0L
        if (!consentValid) return

        val ageVerified = consent.getBoolean("age_verified", false)
        if (!ageVerified) return

        val selectedMode = context.getSharedPreferences(
            "smart_control_mode",
            Context.MODE_PRIVATE
        ).getString("mode", null)
        if (selectedMode.isNullOrBlank()) return

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(Intent(context, FamilySafetyService::class.java).setAction(FamilySafetyService.ACTION_AUTO_START))
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
