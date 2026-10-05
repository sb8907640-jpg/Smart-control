package com.smartcontrol

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import com.smartcontrol.presentation.auth.AuthScreen
import com.smartcontrol.presentation.filetransfer.FileTransferScreen
import com.smartcontrol.presentation.health.DeviceStatusScreen
import com.smartcontrol.presentation.location.LocationSharingScreen
import com.smartcontrol.presentation.pairing.PairingScreen
import com.smartcontrol.presentation.permission.PermissionCenterScreen
import com.smartcontrol.presentation.profile.ProfileScreen
import com.smartcontrol.presentation.owner.OwnerAdminScreen
import com.smartcontrol.presentation.emergency.EmergencyContactsScreen
import com.smartcontrol.presentation.audit.AuditLogScreen
import com.smartcontrol.presentation.privacy.PrivacyControlsScreen
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.presentation.session.SessionScreen
import com.smartcontrol.presentation.safety.SafetyAlertsScreen
import com.smartcontrol.presentation.features.FeatureCenterScreen
import com.smartcontrol.presentation.consent.ConsentScreen
import com.smartcontrol.presentation.settings.SettingsScreen
import com.smartcontrol.presentation.localdata.ContactsScreen
import com.smartcontrol.presentation.localdata.SmsScreen
import com.smartcontrol.presentation.localdata.CallLogsScreen
import com.smartcontrol.presentation.localdata.AppUsageScreen
import com.smartcontrol.presentation.localdata.ClipboardScreen
import com.smartcontrol.presentation.localdata.AppInstallScreen
import com.smartcontrol.presentation.localdata.NotificationCenterScreen
import com.smartcontrol.presentation.billing.BillingScreen
import com.smartcontrol.service.FamilySafetyService
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { FamilySafetyService.start(this) }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            var signedIn by remember { mutableStateOf(false) }
            var consented by remember { mutableStateOf(getSharedPreferences("legal_consent", MODE_PRIVATE).getBoolean("accepted", false)) }
            var settings by remember { mutableStateOf(false) }; var pairing by remember { mutableStateOf(false) }; var permissions by remember { mutableStateOf(false) }
            var profile by remember { mutableStateOf(intent.getBooleanExtra(FamilySafetyService.EXTRA_OPEN_PROFILE, false)) }
            var location by remember { mutableStateOf(false) }; var fileTransfer by remember { mutableStateOf(false) }; var deviceStatus by remember { mutableStateOf(false) }
            var safetyAlerts by remember { mutableStateOf(false) }; var ownerAdmin by remember { mutableStateOf(false) }; var emergencyContacts by remember { mutableStateOf(false) }
            var auditLog by remember { mutableStateOf(false) }; var privacyControls by remember { mutableStateOf(false) }; var featureCenter by remember { mutableStateOf(false) }
            var notifications by remember { mutableStateOf(false) }; var billing by remember { mutableStateOf(false) }
            var contacts by remember { mutableStateOf(false) }; var sms by remember { mutableStateOf(false) }; var callLogs by remember { mutableStateOf(false) }; var appUsage by remember { mutableStateOf(false) }; var clipboard by remember { mutableStateOf(false) }; var appInstall by remember { mutableStateOf(false) }
            if (!consented) ConsentScreen(this@MainActivity) { consented = true }
            else if (!signedIn) AuthScreen(onAuthenticated = { signedIn = true }) else {
                LaunchedEffect(Unit) {
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS) else FamilySafetyService.start(this@MainActivity)
                }
                when {
                    billing -> BillingScreen(onBack = { billing = false })
                    notifications -> NotificationCenterScreen(onBack = { notifications = false })
                    appInstall -> AppInstallScreen(onBack = { appInstall = false })
                    contacts -> ContactsScreen(onBack = { contacts = false })
                    sms -> SmsScreen(onBack = { sms = false })
                    callLogs -> CallLogsScreen(onBack = { callLogs = false })
                    appUsage -> AppUsageScreen(onBack = { appUsage = false })
                    clipboard -> ClipboardScreen(onBack = { clipboard = false })
                    featureCenter -> FeatureCenterScreen(onBack = { featureCenter = false }, onNotifications = { notifications = true }, onContacts = { contacts = true }, onSms = { sms = true }, onCallLogs = { callLogs = true }, onAppUsage = { appUsage = true }, onClipboard = { clipboard = true }, onAppInstall = { appInstall = true })
                    safetyAlerts -> SafetyAlertsScreen(onBack = { safetyAlerts = false })
                    deviceStatus -> DeviceStatusScreen(onBack = { deviceStatus = false })
                    location -> LocationSharingScreen(onBack = { location = false })
                    fileTransfer -> FileTransferScreen(onBack = { fileTransfer = false })
                    pairing -> PairingScreen(onBack = { pairing = false })
                    permissions -> PermissionCenterScreen(onBack = { permissions = false })
                    ownerAdmin -> OwnerAdminScreen(onBack = { ownerAdmin = false })
                    emergencyContacts -> EmergencyContactsScreen(ownerUid = FirebaseAuth.getInstance().currentUser?.uid.orEmpty(), onBack = { emergencyContacts = false })
                    auditLog -> AuditLogScreen(deviceId = FirebaseAuth.getInstance().currentUser?.uid.orEmpty(), onBack = { auditLog = false })
                    privacyControls -> PrivacyControlsScreen(onBack = { privacyControls = false }, context = this@MainActivity)
                    profile -> ProfileScreen(onBack = { profile = false }, onOwnerAdmin = { ownerAdmin = true }, onEmergencyContacts = { emergencyContacts = true }, onAuditLog = { auditLog = true }, onPrivacyControls = { privacyControls = true })
                    settings -> SettingsScreen(onBack = { settings = false }, onEndSession = { settings = false }, onPairing = { pairing = true }, onPermissions = { permissions = true })
                    else -> SessionScreen(onSettings = { settings = true }, onProfile = { profile = true }, onLocation = { location = true }, onFileTransfer = { fileTransfer = true }, onDeviceStatus = { deviceStatus = true }, onSafetyAlerts = { safetyAlerts = true }, onFeatureCenter = { featureCenter = true }, onBilling = { billing = true })
                }
            }
        }
    }
}