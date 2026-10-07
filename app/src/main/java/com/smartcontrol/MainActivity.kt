package com.smartcontrol

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import com.smartcontrol.presentation.auth.AuthScreen
import com.smartcontrol.presentation.consent.ConsentScreen
import com.smartcontrol.presentation.onboarding.AgeVerificationScreen
import com.smartcontrol.presentation.onboarding.ModeSelectScreen
import com.smartcontrol.presentation.session.SessionScreen
import com.smartcontrol.service.FamilySafetyService
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            FamilySafetyService.start(this)
            FamilySafetyService.setSyncing(this)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            var signedIn by remember { mutableStateOf(false) }
            var consented by remember {
                mutableStateOf(
                    getSharedPreferences("legal_consent", MODE_PRIVATE)
                        .getBoolean("accepted", false)
                )
            }
            var ageVerified by remember {
                mutableStateOf(
                    getSharedPreferences("legal_consent", MODE_PRIVATE)
                        .getBoolean("age_verified", false)
                )
            }
            var modeSelected by remember {
                mutableStateOf(
                    getSharedPreferences("smart_control_mode", MODE_PRIVATE)
                        .getString("mode", null) != null
                )
            }
            var running by remember { mutableStateOf(false) }

            fun startServiceFromUserAction() {
                if (running) return
                if (
                    Build.VERSION.SDK_INT >= 33 &&
                    ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    FamilySafetyService.start(this@MainActivity)
                    FamilySafetyService.setSyncing(this@MainActivity)
                }
                running = true
            }

            fun stopServiceFromUserAction() {
                if (!running) return
                FamilySafetyService.setIdle(this@MainActivity)
                FamilySafetyService.stop(this@MainActivity)
                running = false
            }

            if (!consented) {
                ConsentScreen(this@MainActivity) { consented = true }
            } else if (!signedIn) {
                AuthScreen(onAuthenticated = { signedIn = true })
            } else if (!ageVerified) {
                AgeVerificationScreen(this@MainActivity) { ageVerified = true }
            } else if (!modeSelected) {
                ModeSelectScreen(this@MainActivity) { modeSelected = true }
            } else {
                SessionScreen(
                    running = running,
                    onStart = ::startServiceFromUserAction,
                    onStop = ::stopServiceFromUserAction
                )
            }
        }
    }
}
