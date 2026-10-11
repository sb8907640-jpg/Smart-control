package com.smartcontrol

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import com.razorpay.Checkout
import com.razorpay.PaymentData
import com.razorpay.PaymentResultWithDataListener
import com.smartcontrol.domain.billing.Payment
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import android.widget.Toast
import com.smartcontrol.presentation.auth.AuthScreen
import com.smartcontrol.presentation.audit.AuditLogScreen
import com.smartcontrol.presentation.billing.BillingScreen
import com.smartcontrol.presentation.consent.ConsentScreen
import com.smartcontrol.presentation.emergency.EmergencyContactsScreen
import com.smartcontrol.presentation.features.FeatureAccessViewModel
import com.smartcontrol.presentation.features.FeatureCenterScreen
import com.smartcontrol.presentation.features.FeatureUnavailableScreen
import com.smartcontrol.domain.spec.FeatureId
import com.smartcontrol.presentation.filetransfer.FileTransferScreen
import com.smartcontrol.presentation.health.DeviceStatusScreen
import com.smartcontrol.presentation.localdata.AppInstallScreen
import com.smartcontrol.presentation.localdata.AppUsageScreen
import com.smartcontrol.presentation.localdata.CallLogsScreen
import com.smartcontrol.presentation.localdata.ClipboardScreen
import com.smartcontrol.presentation.localdata.ContactsScreen
import com.smartcontrol.presentation.localdata.NotificationCenterScreen
import com.smartcontrol.presentation.localdata.SmsScreen
import com.smartcontrol.presentation.media.MediaSessionPanel
import com.smartcontrol.presentation.location.LocationSharingScreen
import com.smartcontrol.presentation.onboarding.AgeVerificationScreen
import com.smartcontrol.presentation.onboarding.ModeSelectScreen
import com.smartcontrol.presentation.owner.OwnerAdminScreen
import com.smartcontrol.presentation.pairing.PairingScreen
import com.smartcontrol.presentation.permission.PermissionCenterScreen
import com.smartcontrol.presentation.privacy.PrivacyControlsScreen
import com.smartcontrol.presentation.profile.ProfileScreen
import com.smartcontrol.presentation.safety.SafetyAlertsScreen
import com.smartcontrol.presentation.session.SessionScreen
import com.smartcontrol.presentation.settings.SettingsScreen
import com.smartcontrol.service.FamilySafetyService
import androidx.hilt.navigation.compose.hiltViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity(), PaymentResultWithDataListener {

    private var pendingRazorpayPaymentId: String? = null

    private fun startRazorpayCheckout(payment: Payment) {
        val orderId = payment.gatewayOrderId?.takeIf { it.isNotBlank() }
        val keyId = payment.gatewayKeyId?.takeIf { it.isNotBlank() }
        if (orderId == null || keyId == null) {
            Toast.makeText(this, "Payment order is missing Razorpay details.", Toast.LENGTH_LONG).show()
            return
        }
        pendingRazorpayPaymentId = payment.id
        try {
            Checkout.preload(applicationContext)
            val checkout = Checkout()
            checkout.setKeyID(keyId)
            val options = JSONObject().apply {
                put("name", "Family Suraksha")
                put("description", "Subscription: " + payment.planId)
                put("order_id", orderId)
                put("currency", payment.currency)
                put("amount", payment.amountMinor)
                put("prefill", JSONObject().apply {
                    put("email", FirebaseAuth.getInstance().currentUser?.email.orEmpty())
                })
                put("notes", JSONObject().put("smartcontrolPaymentId", payment.id))
            }
            checkout.open(this, options)
        } catch (error: Exception) {
            pendingRazorpayPaymentId = null
            Toast.makeText(this, error.message ?: "Could not open Razorpay checkout.", Toast.LENGTH_LONG).show()
        }
    }

    override fun onPaymentSuccess(razorpayPaymentID: String?, paymentData: PaymentData?) {
        val paymentId = pendingRazorpayPaymentId
        val orderId = paymentData?.orderId
        val paymentReference = paymentData?.paymentId ?: razorpayPaymentID
        val signature = paymentData?.signature
        if (paymentId.isNullOrBlank() || orderId.isNullOrBlank() || paymentReference.isNullOrBlank() || signature.isNullOrBlank()) {
            pendingRazorpayPaymentId = null
            Toast.makeText(this, "Checkout returned incomplete verification details. No subscription was activated.", Toast.LENGTH_LONG).show()
            return
        }
        lifecycleScope.launch {
            try {
                FirebaseFunctions.getInstance().getHttpsCallable("verifyRazorpayPayment").call(
                    mapOf(
                        "paymentId" to paymentId,
                        "razorpayOrderId" to orderId,
                        "razorpayPaymentId" to paymentReference,
                        "razorpaySignature" to signature
                    )
                ).await()
                Toast.makeText(this@MainActivity, "Payment verified by server. Subscription activated.", Toast.LENGTH_LONG).show()
            } catch (error: Exception) {
                Toast.makeText(this@MainActivity, error.message ?: "Server verification failed. Do not retry payment blindly; check billing status.", Toast.LENGTH_LONG).show()
            } finally {
                pendingRazorpayPaymentId = null
            }
        }
    }

    override fun onPaymentError(code: Int, response: String?, paymentData: PaymentData?) {
        pendingRazorpayPaymentId = null
        Toast.makeText(this, "Razorpay checkout failed ($code): " + (response ?: "No details"), Toast.LENGTH_LONG).show()
    }

    private val incomingPairLink = mutableStateOf<android.net.Uri?>(null)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.data?.scheme == "smartcontrol" && intent.data?.host == "pair") {
            incomingPairLink.value = intent.data
        }
    }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            FamilySafetyService.start(this)
            FamilySafetyService.setSyncing(this)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            val featureAccessViewModel: FeatureAccessViewModel = hiltViewModel()
            val featureSettings by featureAccessViewModel.settings.collectAsState()
            var signedIn by remember { mutableStateOf(FirebaseAuth.getInstance().currentUser != null) }
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
            var route by remember { mutableStateOf(if (intent.data?.host == "pair") "pairing" else "session") }
            var pairingLink by remember { mutableStateOf(intent.data?.takeIf { it.scheme == "smartcontrol" && it.host == "pair" }) }
            val pendingPairLink by incomingPairLink
            LaunchedEffect(pendingPairLink) {
                pendingPairLink?.let { link ->
                    pairingLink = link
                    route = "pairing"
                    incomingPairLink.value = null
                }
            }
            var autoStart by remember {
                mutableStateOf(
                    getSharedPreferences("smart_control_settings", MODE_PRIVATE)
                        .getBoolean("auto_start_service", false)
                )
            }
            val uid = FirebaseAuth.getInstance().currentUser?.uid.orEmpty()
            val backToHub: () -> Unit = { route = "features" }

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

            LaunchedEffect(autoStart, modeSelected, signedIn, consented, ageVerified) {
                if (autoStart && signedIn && consented && ageVerified && modeSelected && !running) {
                    startServiceFromUserAction()
                }
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
                val requestedFeature = when (route) {
                    "notifications" -> FeatureId.NOTIFICATIONS
                    "contacts" -> FeatureId.CONTACTS
                    "sms" -> FeatureId.SMS
                    "call_logs" -> FeatureId.CALL_LOGS
                    "app_usage" -> FeatureId.APP_USAGE
                    "clipboard" -> FeatureId.CLIPBOARD_SYNC
                    "app_install" -> FeatureId.APP_INSTALL
                    "location" -> FeatureId.LOCATION
                    "device_status" -> FeatureId.BATTERY_NETWORK
                    "file_transfer" -> FeatureId.FILE_TRANSFER
                    "safety" -> FeatureId.SOS_ALERTS
                    else -> null
                }
                if (requestedFeature != null &&
                    (featureSettings == null || !featureAccessViewModel.isEnabled(requestedFeature, uid))
                ) {
                    FeatureUnavailableScreen(
                        featureName = requestedFeature.name.replace('_', ' '),
                        loading = featureSettings == null,
                        onBack = backToHub
                    )
                } else {
                    when (route) {
                    "pairing" -> PairingScreen(
                        onBack = { route = "session" },
                        initialToken = pairingLink?.getQueryParameter("token")
                    )
                    "features" -> FeatureCenterScreen(
                        onBack = { route = "session" },
                        onNotifications = { route = "notifications" },
                        onContacts = { route = "contacts" },
                        onSms = { route = "sms" },
                        onCallLogs = { route = "call_logs" },
                        onAppUsage = { route = "app_usage" },
                        onClipboard = { route = "clipboard" },
                        onAppInstall = { route = "app_install" },
                        onLocation = { route = "location" },
                        onDeviceStatus = { route = "device_status" },
                        onFileTransfer = { route = "file_transfer" },
                        onPermissions = { route = "permissions" },
                        onSafetyAlerts = { route = "safety" },
                        onBilling = { route = "billing" },
                        onProfile = { route = "profile" },
                        onMediaSession = { route = "media" },
                        onSettings = { route = "settings" }
                    )
                    "notifications" -> NotificationCenterScreen(onBack = backToHub)
                    "contacts" -> ContactsScreen(onBack = backToHub)
                    "sms" -> SmsScreen(onBack = backToHub)
                    "call_logs" -> CallLogsScreen(onBack = backToHub)
                    "app_usage" -> AppUsageScreen(onBack = backToHub)
                    "clipboard" -> ClipboardScreen(onBack = backToHub)
                    "app_install" -> AppInstallScreen(onBack = backToHub)
                    "location" -> LocationSharingScreen(onBack = backToHub)
                    "device_status" -> DeviceStatusScreen(onBack = backToHub)
                    "file_transfer" -> FileTransferScreen(onBack = backToHub)
                    "permissions" -> PermissionCenterScreen(onBack = backToHub)
                    "media" -> MediaSessionPanel(onBack = backToHub)
                    "safety" -> SafetyAlertsScreen(onBack = backToHub)
                    "billing" -> BillingScreen(onBack = backToHub, onRazorpayCheckout = ::startRazorpayCheckout)
                    "settings" -> SettingsScreen(
                        onBack = backToHub,
                        onEndSession = {
                            stopServiceFromUserAction()
                            route = "session"
                        },
                        onPairing = { route = "pairing" },
                        onPermissions = { route = "permissions" }
                    )
                    "profile" -> ProfileScreen(
                        onBack = backToHub,
                        onOwnerAdmin = { route = "owner" },
                        onEmergencyContacts = { route = "emergency" },
                        onAuditLog = { route = "audit" },
                        onPrivacyControls = { route = "privacy" }
                    )
                    "owner" -> OwnerAdminScreen(onBack = backToHub)
                    "emergency" -> EmergencyContactsScreen(ownerUid = uid, onBack = backToHub)
                    "audit" -> AuditLogScreen(deviceId = uid.ifBlank { "local-device" }, onBack = backToHub)
                    "privacy" -> PrivacyControlsScreen(onBack = backToHub, context = this@MainActivity)
                    else -> SessionScreen(
                        running = running,
                        onOpenPairing = { route = "pairing" },
                        onOpenFeatures = { route = "features" },
                        onStart = ::startServiceFromUserAction,
                        onStop = ::stopServiceFromUserAction,
                        autoStart = autoStart,
                        onAutoStartChanged = { enabled ->
                            autoStart = enabled
                            getSharedPreferences("smart_control_settings", MODE_PRIVATE)
                                .edit().putBoolean("auto_start_service", enabled).apply()
                        }
                    )
                    }
                }
            }
        }
    }
}
