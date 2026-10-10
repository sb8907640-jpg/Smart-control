package com.smartcontrol.presentation.owner

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.tasks.await
import com.smartcontrol.domain.owner.FeatureOverride
import com.smartcontrol.data.billing.OwnerBillingRepository
import com.smartcontrol.data.billing.OwnerProfile
import com.smartcontrol.domain.billing.FreeGrant
import com.smartcontrol.domain.billing.Plan
import com.smartcontrol.domain.billing.Payment
import com.smartcontrol.domain.billing.Subscription
import com.smartcontrol.domain.billing.Coupon
import com.smartcontrol.domain.billing.PayoutRecord
import com.smartcontrol.domain.owner.OwnerSettings
import com.smartcontrol.domain.owner.OwnerSettingsRepository
import com.smartcontrol.domain.owner.OwnerSettingsHistoryEntry
import com.smartcontrol.domain.owner.OwnerManagedUser
import com.smartcontrol.domain.owner.OwnerUserManagementRepository
import com.smartcontrol.domain.spec.FeatureCatalog
import com.smartcontrol.domain.spec.FeatureId
import com.smartcontrol.domain.spec.MasterSpecification
import com.smartcontrol.domain.spec.PermissionMode
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class OwnerAdminViewModel @Inject constructor(
    private val repository: OwnerSettingsRepository,
    private val billingRepository: OwnerBillingRepository,
    private val userManagementRepository: OwnerUserManagementRepository
) : ViewModel() {
    var admin by mutableStateOf<Boolean?>(null)
        private set
    var settings by mutableStateOf(
        OwnerSettings(
            globalFeaturesEnabled = true,
            featureOverrides = emptyMap(),
            permissionCopy = emptyList(),
            pushNotificationsEnabled = true,
            emailNotificationsEnabled = false,
            smsNotificationsEnabled = false,
            sosEnabled = true,
            dataDownloadEnabled = true,
            dataShareEnabled = false,
            dataDeleteEnabled = true
        )
    )
        private set
    var saving by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var ownerProfile by mutableStateOf(OwnerProfile())
        private set
    var plans by mutableStateOf<List<Plan>>(emptyList())
        private set
    var freeGrants by mutableStateOf<List<FreeGrant>>(emptyList())
        private set
    var history by mutableStateOf<List<OwnerSettingsHistoryEntry>>(emptyList())
        private set
    var managedUsers by mutableStateOf<List<OwnerManagedUser>>(emptyList())
    var payments by mutableStateOf<List<Payment>>(emptyList())
    var subscriptions by mutableStateOf<List<Subscription>>(emptyList())
    var reportTotalMinor by mutableStateOf(0L)
    var payouts by mutableStateOf<List<PayoutRecord>>(emptyList())
        private set

    init {
        viewModelScope.launch {
            admin = repository.isAdmin()
            if (admin == true) {
                ownerProfile = runCatching { billingRepository.getOwnerProfile() }.getOrDefault(OwnerProfile())
                launch { billingRepository.observePlans().collect { plans = it } }
                launch { billingRepository.observeFreeGrants().collect { freeGrants = it } }
                launch { repository.observeHistory().collect { history = it } }
                launch { managedUsers = userManagementRepository.listUsers().getOrDefault(emptyList()) }
                launch { refreshPaymentData() }
                repository.observe().collect { settings = it }
            }
        }
    }

    fun toggle(featureId: FeatureId, enabled: Boolean) {
        val current = settings.featureOverrides[featureId]
            ?: FeatureOverride(featureId, true, null, 0)
        settings = settings.copy(
            featureOverrides = settings.featureOverrides +
                (featureId to current.copy(enabled = enabled))
        )
    }

    fun setGlobalFeaturesEnabled(enabled: Boolean) {
        settings = settings.copy(
            globalFeaturesEnabled = enabled,
            masterConfig = settings.masterConfig.copy(
                access = settings.masterConfig.access.copy(globalEnabled = enabled)
            )
        )
    }

    fun setPermissionMode(mode: PermissionMode) {
        settings = settings.copy(
            masterConfig = settings.masterConfig.copy(
                permissions = settings.masterConfig.permissions.copy(mode = mode)
            )
        )
    }

    fun editOwnerValue(key: String, value: String) {
        val values = settings.masterConfig.ownerControl.editableValues.toMutableMap()
        values[key] = value
        settings = settings.copy(
            masterConfig = settings.masterConfig.copy(
                ownerControl = settings.masterConfig.ownerControl.copy(editableValues = values)
            )
        )
    }

    fun setOwnerFlag(
        hidden: Boolean = settings.masterConfig.ownerControl.ownerPanelHiddenFromNormalUsers,
        realtime: Boolean = settings.masterConfig.ownerControl.realtimeApply,
        changeLog: Boolean = settings.masterConfig.ownerControl.changeLogEnabled,
        rollback: Boolean = settings.masterConfig.ownerControl.rollbackEnabled
    ) {
        settings = settings.copy(
            masterConfig = settings.masterConfig.copy(
                ownerControl = settings.masterConfig.ownerControl.copy(
                    ownerPanelHiddenFromNormalUsers = hidden,
                    realtimeApply = realtime,
                    changeLogEnabled = changeLog,
                    rollbackEnabled = rollback
                )
            )
        )
    }

    fun saveOwnerProfile(profile: OwnerProfile) {
        viewModelScope.launch {
            message = billingRepository.saveOwnerProfile(profile)
                .fold({ "Owner details saved." }, { it.message ?: "Owner details save failed." })
            if (message == "Owner details saved.") ownerProfile = profile
        }
    }

    fun savePlan(plan: Plan) {
        viewModelScope.launch {
            message = billingRepository.savePlan(plan)
                .fold({ "Plan saved." }, { it.message ?: "Plan save failed." })
        }
    }

    fun deletePlan(planId: String) {
        viewModelScope.launch {
            message = billingRepository.deletePlan(planId)
                .fold({ "Plan deleted." }, { it.message ?: "Plan delete failed." })
        }
    }

    fun duplicatePlan(sourcePlanId: String, newPlanId: String, newName: String) {
        viewModelScope.launch {
            message = billingRepository.duplicatePlan(sourcePlanId, newPlanId, newName)
                .fold({ "Plan duplicated." }, { it.message ?: "Plan duplicate failed." })
        }
    }

    fun savePaymentGatewaySettings(provider: String, mode: String, webhookSecret: String, providerConfig: String) {
        val normalizedProvider = provider.trim().uppercase().ifBlank { "TEST" }
        val normalizedMode = mode.trim().uppercase().ifBlank { "TEST" }
        val values = settings.masterConfig.ownerControl.editableValues.toMutableMap()
        values["payment.gatewayProvider"] = normalizedProvider
        values["payment.gatewayMode"] = normalizedMode
        values["payment.webhookSecret"] = webhookSecret
        values["payment.gatewayProviderConfig"] = providerConfig
        settings = settings.copy(
            masterConfig = settings.masterConfig.copy(
                ownerControl = settings.masterConfig.ownerControl.copy(editableValues = values)
            )
        )
        save()
    }

    fun refreshPaymentData() {
        viewModelScope.launch {
            payments = billingRepository.listPayments().getOrDefault(emptyList())
            subscriptions = billingRepository.listSubscriptions().getOrDefault(emptyList())
            payouts = billingRepository.listPayouts().getOrDefault(emptyList())
        }
    }

    fun verifyPayment(paymentId: String, reference: String) {
        viewModelScope.launch {
            message = billingRepository.verifyPayment(paymentId, reference)
                .fold({ "Payment verified and subscription activated." }, { it.message ?: "Payment verification failed." })
            refreshPaymentData()
        }
    }

    fun refundPayment(paymentId: String) {
        viewModelScope.launch {
            message = billingRepository.refundPayment(paymentId)
                .fold({ "Payment refunded: ₹" + (it / 100.0) }, { it.message ?: "Refund failed." })
            refreshPaymentData()
        }
    }

    fun saveCoupon(code: String, discountPercent: String, discountMinor: String, usageLimit: String) {
        viewModelScope.launch {
            val coupon = Coupon(
                code = code.trim().uppercase(),
                discountPercent = discountPercent.toDoubleOrNull()?.coerceIn(0.0, 100.0) ?: 0.0,
                discountMinor = discountMinor.toLongOrNull()?.coerceAtLeast(0L) ?: 0L,
                usageLimit = usageLimit.toLongOrNull()?.coerceAtLeast(0L) ?: 0L
            )
            message = billingRepository.createCoupon(coupon)
                .fold({ "Coupon saved." }, { it.message ?: "Coupon save failed." })
        }
    }

    fun recordPayout(amount: String, method: String, account: String) {
        viewModelScope.launch {
            val payout = PayoutRecord(
                id = "",
                amountMinor = ((amount.toDoubleOrNull() ?: 0.0) * 100).toLong(),
                currency = "INR",
                method = method,
                accountLabel = account,
                status = "RECORDED",
                createdAtEpochMs = System.currentTimeMillis()
            )
            message = billingRepository.recordPayout(payout)
                .fold(
                    { saved -> "Payout recorded: ₹" + (saved.amountMinor / 100.0) },
                    { error -> error.message ?: "Payout failed." }
                )
            refreshPaymentData()
        }
    }

    fun loadPaymentReport(startEpochMs: Long, endEpochMs: Long) {
        viewModelScope.launch {
            reportTotalMinor = billingRepository.getPaymentReport(startEpochMs, endEpochMs)
                .getOrElse { 0L to emptyList() }.first
            message = "Payment report loaded: ₹" + (reportTotalMinor / 100.0)
        }
    }

    fun grantFreeAccess(grant: FreeGrant) {
        viewModelScope.launch {
            message = billingRepository.grantFreeAccess(grant)
                .fold({ "Free access approved." }, { it.message ?: "Free access failed." })
        }
    }

    fun updateFreeAccess(grant: FreeGrant) {
        viewModelScope.launch {
            message = billingRepository.updateFreeAccess(grant)
                .fold({ "Free access updated." }, { it.message ?: "Free access update failed." })
        }
    }

    fun revokeFreeAccess(grant: FreeGrant) {
        viewModelScope.launch {
            message = billingRepository.revokeFreeAccess(grant)
                .fold({ "Free access revoked." }, { it.message ?: "Free access revoke failed." })
        }
    }

    fun refreshUsers() {
        viewModelScope.launch {
            userManagementRepository.listUsers().fold(
                onSuccess = { managedUsers = it; message = "User list refreshed." },
                onFailure = { message = it.message ?: "User list refresh failed." }
            )
        }
    }

    fun setUserAccess(user: OwnerManagedUser, role: String, granted: Boolean, durationDays: Long) {
        viewModelScope.launch {
            val expires = if (granted && durationDays > 0) {
                System.currentTimeMillis() + durationDays * 86_400_000L
            } else null
            message = userManagementRepository.setUserAccess(user.uid, role, granted, expires)
                .fold({ "User access updated." }, { it.message ?: "User access update failed." })
            if (message == "User access updated.") refreshUsers()
        }
    }

    fun setUserBlocked(user: OwnerManagedUser, blocked: Boolean) {
        viewModelScope.launch {
            message = userManagementRepository.setUserBlocked(user.uid, blocked)
                .fold({ if (blocked) "User blocked." else "User unblocked." }, { it.message ?: "User status update failed." })
            if (message?.contains("User blocked") == true || message?.contains("User unblocked") == true) refreshUsers()
        }
    }

    fun rollback(historyId: String) {
        viewModelScope.launch {
            message = repository.rollback(historyId)
                .fold({ "Settings rolled back." }, { it.message ?: "Rollback failed." })
        }
    }

    fun save() {
        viewModelScope.launch {
            saving = true
            message = repository.save(settings)
                .fold({ "All owner/master settings saved." }, { it.message ?: "Save failed." })
            saving = false
        }
    }
}

private val ownerSections = listOf(
    "branding" to "1. App Branding",
    "features" to "2. Feature Control",
    "permissions" to "3. Permission Settings",
    "plans" to "4. Plans & Subscriptions",
    "users" to "5. User Management",
    "content" to "6. Text & Content",
    "links" to "7. Link & URL Settings",
    "control" to "8. Control Settings",
    "connection" to "9. Connection Settings",
    "notifications" to "10. Notification Settings",
    "ui" to "11. UI / UX Settings",
    "security" to "12. Security Settings",
    "data" to "13. Data Settings",
    "sos" to "14. SOS Settings",
    "language" to "15. Language Settings",
    "payment" to "16-20. Plan / Payment / EMI / Invoice / Refund Settings"
)

@Composable
fun OwnerAdminScreen(
    onBack: () -> Unit,
    viewModel: OwnerAdminViewModel = hiltViewModel()
) {
    val admin = viewModel.admin
    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("Owner / Admin Control Panel", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        when (admin) {
            null -> CircularProgressIndicator()
            false -> {
                Text("Owner panel is restricted to authenticated Firebase admin accounts.")
                Text("Normal users cannot access owner controls.")
            }
            true -> {
                Text("Master specification v${MasterSpecification.VERSION}")
                Text("Live owner configuration is stored in ownerSettings/global and observed by the app.")
                Text("Sensitive Android permissions still require the client's own system consent.")

                Spacer(Modifier.height(10.dp))
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text("Owner access policy", style = MaterialTheme.typography.titleMedium)
                        Text("Role: ${viewModel.settings.masterConfig.ownerControl.ownerRole}")
                        Text("Firebase admin claim required: ${viewModel.settings.masterConfig.ownerControl.requireFirebaseAdminClaim}")
                        PolicySwitch(
                            "Hide owner panel from normal users",
                            viewModel.settings.masterConfig.ownerControl.ownerPanelHiddenFromNormalUsers
                        ) { viewModel.setOwnerFlag(hidden = it) }
                        PolicySwitch(
                            "Real-time configuration apply",
                            viewModel.settings.masterConfig.ownerControl.realtimeApply
                        ) { viewModel.setOwnerFlag(realtime = it) }
                        PolicySwitch(
                            "Change log",
                            viewModel.settings.masterConfig.ownerControl.changeLogEnabled
                        ) { viewModel.setOwnerFlag(changeLog = it) }
                        PolicySwitch(
                            "Rollback metadata",
                            viewModel.settings.masterConfig.ownerControl.rollbackEnabled
                        ) { viewModel.setOwnerFlag(rollback = it) }
                    }
                }

                Spacer(Modifier.height(8.dp))
                Text("19 Feature Controls", style = MaterialTheme.typography.titleLarge)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
                    item {
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(10.dp)) {
                                PolicySwitch(
                                    "Enable all features globally",
                                    viewModel.settings.globalFeaturesEnabled,
                                    viewModel::setGlobalFeaturesEnabled
                                )
                                Text("When disabled, feature screens are blocked for all users. Android permissions and receiver consent remain required when re-enabled.")
                            }
                        }
                    }
                    items(FeatureCatalog.all) { spec ->
                        val enabled = viewModel.settings.featureOverrides[spec.id]?.enabled ?: true
                        Card(Modifier.fillMaxWidth()) {
                            Row(
                                Modifier.fillMaxWidth().padding(10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(spec.displayName)
                                    Text("Consent: " + spec.consent.joinToString())
                                }
                                Switch(checked = enabled, onCheckedChange = { viewModel.toggle(spec.id, it) })
                            }
                        }
                    }

                    item {
                        Spacer(Modifier.height(8.dp))
                        Text("Complete Owner Settings — 15 sections", style = MaterialTheme.typography.titleLarge)
                    }

                    item {
                        OwnerUserManagementPanel(
                            users = viewModel.managedUsers,
                            onRefresh = viewModel::refreshUsers,
                            onAccessSave = viewModel::setUserAccess,
                            onBlockToggle = viewModel::setUserBlocked
                        )
                    }

                    ownerSections.forEach { (prefix, title) ->
                        item {
                            OwnerSettingsSection(
                                title = title,
                                prefix = prefix,
                                values = viewModel.settings.masterConfig.ownerControl.editableValues,
                                onValueChange = viewModel::editOwnerValue
                            )
                        }
                    }

                    item {
                        PaymentGatewayPermitPanel()
                    }

                    item {
                        OwnerHistoryPanel(
                            history = viewModel.history,
                            onRollback = viewModel::rollback
                        )
                    }

                    item {
                        OwnerBillingPanel(
                            profile = viewModel.ownerProfile,
                            plans = viewModel.plans,
                            grants = viewModel.freeGrants,
                            onProfileSave = viewModel::saveOwnerProfile,
                            onPlanSave = viewModel::savePlan,
                            onPlanDelete = viewModel::deletePlan,
                            onPlanDuplicate = viewModel::duplicatePlan,
                            onGrant = viewModel::grantFreeAccess,
                            onGrantUpdate = viewModel::updateFreeAccess,
                            onGrantRevoke = viewModel::revokeFreeAccess
                        )
                    }

                    item {
                        OwnerPaymentPanel(
                            payments = viewModel.payments,
                            subscriptions = viewModel.subscriptions,
                            payouts = viewModel.payouts,
                            reportTotalMinor = viewModel.reportTotalMinor,
                            onRefresh = viewModel::refreshPaymentData,
                            onVerify = viewModel::verifyPayment,
                            onRefund = viewModel::refundPayment,
                            onSaveCoupon = viewModel::saveCoupon,
                            onRecordPayout = viewModel::recordPayout,
                            onLoadReport = viewModel::loadPaymentReport,
                            gatewayProvider = viewModel.settings.masterConfig.ownerControl.editableValues["payment.gatewayProvider"] ?: "TEST",
                            gatewayMode = viewModel.settings.masterConfig.ownerControl.editableValues["payment.gatewayMode"] ?: "TEST",
                            gatewayWebhookSecret = viewModel.settings.masterConfig.ownerControl.editableValues["payment.webhookSecret"] ?: "",
                            gatewayProviderConfig = viewModel.settings.masterConfig.ownerControl.editableValues["payment.gatewayProviderConfig"] ?: "",
                            onSaveGatewaySettings = viewModel::savePaymentGatewaySettings
                        )
                    }

                    item {
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp)) {
                                Text("Save / persistence", style = MaterialTheme.typography.titleMedium)
                                Text("Existing ownerSettings fields are preserved with Firestore merge semantics.")
                                Button(onClick = viewModel::save, enabled = !viewModel.saving) {
                                    Text(if (viewModel.saving) "Saving..." else "Save All Owner Settings")
                                }
                                viewModel.message?.let { Text(it) }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(onClick = onBack) { Text("Back") }
                    }
                }
            }
        }
    }
}

@Composable
private fun OwnerSettingsSection(
    title: String,
    prefix: String,
    values: Map<String, String>,
    onValueChange: (String, String) -> Unit
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (prefix == "data") {
                PolicySwitch(
                    "Allow device health / permission-status collection",
                    values["data.autoCapture"]?.toBooleanStrictOrNull() ?: false
                ) { onValueChange("data.autoCapture", it.toString()) }
                PolicySwitch(
                    "Allow device health data sharing to the linked account",
                    values["data.shareAllowed"]?.toBooleanStrictOrNull() ?: false
                ) { onValueChange("data.shareAllowed", it.toString()) }
                Text("Collection requires both owner switches and each device user must also enable sharing in Privacy Controls.")
            }
            values.filterKeys {
                it.startsWith("$prefix.") && !(prefix == "data" && it in setOf("data.autoCapture", "data.shareAllowed"))
            }.forEach { (key, value) ->
                OutlinedTextField(
                    value = value,
                    onValueChange = { onValueChange(key, it) },
                    label = { Text(key.removePrefix("$prefix.")) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 5.dp)
                )
            }
        }
    }
}

@Composable
private fun PolicySwitch(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}


@Composable
private fun OwnerBillingPanel(
    profile: OwnerProfile,
    plans: List<Plan>,
    grants: List<FreeGrant>,
    onProfileSave: (OwnerProfile) -> Unit,
    onPlanSave: (Plan) -> Unit,
    onPlanDelete: (String) -> Unit,
    onPlanDuplicate: (String, String, String) -> Unit,
    onGrant: (FreeGrant) -> Unit,
    onGrantUpdate: (FreeGrant) -> Unit,
    onGrantRevoke: (FreeGrant) -> Unit
) {
    var displayName by remember(profile) { mutableStateOf(profile.displayName) }
    var emails by remember(profile) { mutableStateOf(profile.emails.joinToString(",")) }
    var mobiles by remember(profile) { mutableStateOf(profile.mobiles.joinToString(",")) }
    var support by remember(profile) { mutableStateOf(profile.supportWhatsApp) }
    var loginPath by remember(profile) { mutableStateOf(profile.hiddenLoginPath) }

    var planId by remember { mutableStateOf("") }
    var planName by remember { mutableStateOf("") }
    var planDescription by remember { mutableStateOf("") }
    var planTagline by remember { mutableStateOf("") }
    var planIcon by remember { mutableStateOf("") }
    var planColor by remember { mutableStateOf("") }
    var planBadge by remember { mutableStateOf("") }
    var planPrice by remember { mutableStateOf("0") }
    var planCurrency by remember { mutableStateOf("INR") }
    var planDuration by remember { mutableStateOf("30") }
    var planDurationUnit by remember { mutableStateOf("DAY") }
    var planEnabled by remember { mutableStateOf(true) }
    var planAutoRenew by remember { mutableStateOf(false) }
    var planGraceDays by remember { mutableStateOf("0") }
    var planReminderDays by remember { mutableStateOf("3") }
    var planDiscountPercent by remember { mutableStateOf("0") }
    var planDiscountMinor by remember { mutableStateOf("0") }
    var planTaxPercent by remember { mutableStateOf("0") }
    var planOriginalPrice by remember { mutableStateOf("") }
    var planOfferVisible by remember { mutableStateOf(true) }
    var planDisplayOrder by remember { mutableStateOf("0") }
    var planTier by remember { mutableStateOf("0") }
    var planDeviceLimit by remember { mutableStateOf("1") }
    var planUserLimit by remember { mutableStateOf("1") }
    var planStorageLimit by remember { mutableStateOf("0") }
    var planBandwidthLimit by remember { mutableStateOf("0") }
    var planUpgradeIds by remember { mutableStateOf("") }
    var planDowngradeIds by remember { mutableStateOf("") }
    var planCrossGrade by remember { mutableStateOf(true) }
    var planFeatureLimits by remember { mutableStateOf("") }
    var planFeatureTimes by remember { mutableStateOf("") }
    var planFeaturePriorities by remember { mutableStateOf("") }
    var selectedFeatures by remember { mutableStateOf(emptySet<String>()) }
    var selectedPlanId by remember { mutableStateOf<String?>(null) }
    var duplicateId by remember { mutableStateOf("") }
    var duplicateName by remember { mutableStateOf("") }

    var grantUserId by remember { mutableStateOf("") }
    var grantName by remember { mutableStateOf("") }
    var grantEmail by remember { mutableStateOf("") }
    var grantMobile by remember { mutableStateOf("") }
    var grantPlanId by remember { mutableStateOf("free") }
    var grantDays by remember { mutableStateOf("7") }
    var grantFeatures by remember { mutableStateOf(emptySet<String>()) }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
                Text("Owner Details — editable", style = MaterialTheme.typography.titleLarge)
                Text("These values are owner-only and are never shown to normal users.")
                OutlinedTextField(displayName, { displayName = it }, label = { Text("Owner display name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(emails, { emails = it }, label = { Text("Owner emails, comma separated") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(mobiles, { mobiles = it }, label = { Text("Owner mobiles, comma separated") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(support, { support = it }, label = { Text("Hidden support WhatsApp") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(loginPath, { loginPath = it }, label = { Text("Owner login route") }, modifier = Modifier.fillMaxWidth())
                Button(onClick = {
                    onProfileSave(
                        OwnerProfile(
                            displayName = displayName.trim(),
                            emails = emails.split(",").map { it.trim() }.filter { it.isNotBlank() },
                            mobiles = mobiles.split(",").map { it.trim() }.filter { it.isNotBlank() },
                            supportWhatsApp = support.trim(),
                            hiddenLoginPath = loginPath.trim()
                        )
                    )
                }) { Text("Save Owner Details") }
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
                Text("Plans & Permission System", style = MaterialTheme.typography.titleLarge)
                Text("All master plan fields are editable. Payment configuration remains in the Owner Settings payment section below.")
                OutlinedTextField(planId, { planId = it }, label = { Text("Plan ID") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planName, { planName = it }, label = { Text("Plan name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planDescription, { planDescription = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planTagline, { planTagline = it }, label = { Text("Tagline") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planIcon, { planIcon = it }, label = { Text("Icon key") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planColor, { planColor = it }, label = { Text("Color key") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planBadge, { planBadge = it }, label = { Text("Badge") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planPrice, { planPrice = it }, label = { Text("Price") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planCurrency, { planCurrency = it.uppercase() }, label = { Text("Currency") }, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(planDurationUnit, { planDurationUnit = it.uppercase() }, label = { Text("Unit HOUR/DAY/WEEK/MONTH/YEAR") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(planDuration, { planDuration = it.filter(Char::isDigit) }, label = { Text("Duration") }, modifier = Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { planDurationUnit = "DAY"; planDuration = "30" }) { Text("30 days") }
                    Button(onClick = { planDurationUnit = "DAY"; planDuration = "90" }) { Text("90 days") }
                    Button(onClick = { planDurationUnit = "DAY"; planDuration = "365" }) { Text("365 days") }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Plan enabled")
                    Switch(planEnabled, { planEnabled = it })
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Auto renew")
                    Switch(planAutoRenew, { planAutoRenew = it })
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(planGraceDays, { planGraceDays = it.filter(Char::isDigit) }, label = { Text("Grace days") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(planReminderDays, { planReminderDays = it.filter(Char::isDigit) }, label = { Text("Expiry reminder days") }, modifier = Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(planDiscountPercent, { planDiscountPercent = it }, label = { Text("Discount %") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(planDiscountMinor, { planDiscountMinor = it.filter(Char::isDigit) }, label = { Text("Discount minor") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(planTaxPercent, { planTaxPercent = it }, label = { Text("Tax %") }, modifier = Modifier.weight(1f))
                }
                OutlinedTextField(planOriginalPrice, { planOriginalPrice = it }, label = { Text("Original price (optional)") }, modifier = Modifier.fillMaxWidth())
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Show offer price")
                    Switch(planOfferVisible, { planOfferVisible = it })
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(planDisplayOrder, { planDisplayOrder = it.filter(Char::isDigit) }, label = { Text("Display order") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(planTier, { planTier = it.filter(Char::isDigit) }, label = { Text("Tier level") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(planDeviceLimit, { planDeviceLimit = it.filter(Char::isDigit) }, label = { Text("Device limit") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(planUserLimit, { planUserLimit = it.filter(Char::isDigit) }, label = { Text("User limit") }, modifier = Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(planStorageLimit, { planStorageLimit = it.filter(Char::isDigit) }, label = { Text("Storage bytes") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(planBandwidthLimit, { planBandwidthLimit = it.filter(Char::isDigit) }, label = { Text("Bandwidth bytes") }, modifier = Modifier.weight(1f))
                }
                OutlinedTextField(planUpgradeIds, { planUpgradeIds = it }, label = { Text("Upgrade plan IDs, comma separated") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planDowngradeIds, { planDowngradeIds = it }, label = { Text("Downgrade plan IDs, comma separated") }, modifier = Modifier.fillMaxWidth())
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Tier cross-grade enabled")
                    Switch(planCrossGrade, { planCrossGrade = it })
                }
                OutlinedTextField(planFeatureLimits, { planFeatureLimits = it }, label = { Text("Feature limits: FEATURE=number, ...") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planFeatureTimes, { planFeatureTimes = it }, label = { Text("Feature time limits seconds: FEATURE=seconds, ...") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planFeaturePriorities, { planFeaturePriorities = it }, label = { Text("Feature priorities: FEATURE=number, ...") }, modifier = Modifier.fillMaxWidth())
                Text("Allowed features", style = MaterialTheme.typography.titleMedium)
                FeatureCatalog.all.forEach { feature ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(feature.displayName)
                        Switch(
                            checked = selectedFeatures.contains(feature.id.name),
                            onCheckedChange = { checked ->
                                selectedFeatures = if (checked) selectedFeatures + feature.id.name
                                else selectedFeatures - feature.id.name
                            }
                        )
                    }
                }
                Button(onClick = {
                    val id = planId.trim().ifBlank { "plan-" + System.currentTimeMillis() }
                    val unit = planDurationUnit.trim().uppercase().ifBlank { "DAY" }
                    val value = planDuration.toLongOrNull()?.coerceAtLeast(1L) ?: 30L
                    val durationDays = when (unit) {
                        "HOUR" -> ((value + 23L) / 24L).toInt()
                        "WEEK" -> (value * 7L).toInt()
                        "MONTH" -> (value * 30L).toInt()
                        "YEAR" -> (value * 365L).toInt()
                        else -> value.toInt()
                    }
                    onPlanSave(
                        Plan(
                            id = id,
                            name = planName.ifBlank { id },
                            description = planDescription,
                            priceMinor = ((planPrice.toDoubleOrNull() ?: 0.0) * 100).toLong(),
                            currency = planCurrency.ifBlank { "INR" },
                            durationDays = durationDays,
                            enabled = planEnabled,
                            featureIds = selectedFeatures,
                            deviceLimit = planDeviceLimit.toIntOrNull()?.coerceAtLeast(1) ?: 1,
                            userLimit = planUserLimit.toIntOrNull()?.coerceAtLeast(1) ?: 1,
                            storageLimitBytes = planStorageLimit.toLongOrNull()?.coerceAtLeast(0L) ?: 0L,
                            bandwidthLimitBytes = planBandwidthLimit.toLongOrNull()?.coerceAtLeast(0L) ?: 0L,
                            tagline = planTagline,
                            iconKey = planIcon,
                            badge = planBadge,
                            durationUnit = unit,
                            durationValue = value,
                            autoRenew = planAutoRenew,
                            gracePeriodDays = planGraceDays.toIntOrNull()?.coerceAtLeast(0) ?: 0,
                            expiryReminderDays = planReminderDays.toIntOrNull()?.coerceAtLeast(0) ?: 3,
                            discountPercent = planDiscountPercent.toDoubleOrNull()?.coerceIn(0.0, 100.0) ?: 0.0,
                            discountMinor = planDiscountMinor.toLongOrNull()?.coerceAtLeast(0L) ?: 0L,
                            taxPercent = planTaxPercent.toDoubleOrNull()?.coerceIn(0.0, 100.0) ?: 0.0,
                            originalPriceMinor = planOriginalPrice.toDoubleOrNull()?.let { (it * 100).toLong() },
                            offerPriceVisible = planOfferVisible,
                            displayOrder = planDisplayOrder.toIntOrNull() ?: 0,
                            tierLevel = planTier.toIntOrNull() ?: 0,
                            upgradePlanIds = csvSet(planUpgradeIds),
                            downgradePlanIds = csvSet(planDowngradeIds),
                            crossGradeEnabled = planCrossGrade,
                            colorKey = planColor,
                            featureLimits = parseLongMap(planFeatureLimits),
                            featureTimeLimitsSeconds = parseLongMap(planFeatureTimes),
                            featurePriorities = parseIntMap(planFeaturePriorities)
                        )
                    )
                }) { Text("Create / Save Plan") }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(duplicateId, { duplicateId = it }, label = { Text("Duplicate as plan ID") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(duplicateName, { duplicateName = it }, label = { Text("Duplicate name") }, modifier = Modifier.weight(1f))
                    Button(onClick = {
                        if (selectedPlanId != null && duplicateId.isNotBlank()) {
                            onPlanDuplicate(selectedPlanId!!, duplicateId.trim(), duplicateName.trim())
                        }
                    }) { Text("Duplicate") }
                }

                plans.forEach { plan ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(8.dp)) {
                            Text("${plan.name} — ₹${plan.priceMinor / 100.0} — ${plan.durationDays} days")
                            Text("Features: ${plan.featureIds.size}/19")
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = {
                                    selectedPlanId = plan.id
                                    planId = plan.id
                                    planName = plan.name
                                    planDescription = plan.description
                                    planTagline = plan.tagline
                                    planIcon = plan.iconKey
                                    planColor = plan.colorKey
                                    planBadge = plan.badge
                                    planPrice = (plan.priceMinor / 100.0).toString()
                                    planCurrency = plan.currency
                                    planDurationUnit = plan.durationUnit
                                    planDuration = plan.durationValue.toString()
                                    planEnabled = plan.enabled
                                    planAutoRenew = plan.autoRenew
                                    planGraceDays = plan.gracePeriodDays.toString()
                                    planReminderDays = plan.expiryReminderDays.toString()
                                    planDiscountPercent = plan.discountPercent.toString()
                                    planDiscountMinor = plan.discountMinor.toString()
                                    planTaxPercent = plan.taxPercent.toString()
                                    planOriginalPrice = plan.originalPriceMinor?.let { (it / 100.0).toString() } ?: ""
                                    planOfferVisible = plan.offerPriceVisible
                                    planDisplayOrder = plan.displayOrder.toString()
                                    planTier = plan.tierLevel.toString()
                                    planDeviceLimit = plan.deviceLimit.toString()
                                    planUserLimit = plan.userLimit.toString()
                                    planStorageLimit = plan.storageLimitBytes.toString()
                                    planBandwidthLimit = plan.bandwidthLimitBytes.toString()
                                    planUpgradeIds = plan.upgradePlanIds.joinToString(",")
                                    planDowngradeIds = plan.downgradePlanIds.joinToString(",")
                                    planCrossGrade = plan.crossGradeEnabled
                                    planFeatureLimits = plan.featureLimits.entries.joinToString(",") { it.key + "=" + it.value }
                                    planFeatureTimes = plan.featureTimeLimitsSeconds.entries.joinToString(",") { it.key + "=" + it.value }
                                    planFeaturePriorities = plan.featurePriorities.entries.joinToString(",") { it.key + "=" + it.value }
                                    selectedFeatures = plan.featureIds
                                }) { Text("Edit") }
                                OutlinedButton(onClick = { onPlanDelete(plan.id) }) { Text("Delete") }
                            }
                        }
                    }
                }
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
                Text("Free Access — Owner Manual Approval", style = MaterialTheme.typography.titleLarge)
                Text("Grant access to a specific user for a chosen duration and selected features. Access automatically expires by its end timestamp.")
                OutlinedTextField(grantUserId, { grantUserId = it }, label = { Text("User ID / sign-in ID") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(grantName, { grantName = it }, label = { Text("User name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(grantEmail, { grantEmail = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(grantMobile, { grantMobile = it }, label = { Text("Mobile") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(grantPlanId, { grantPlanId = it }, label = { Text("Plan ID / free") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(grantDays, { grantDays = it }, label = { Text("Access duration (days)") }, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { grantDays = "1" }) { Text("1 day") }
                    Button(onClick = { grantDays = "7" }) { Text("7 days") }
                    Button(onClick = { grantDays = "30" }) { Text("30 days") }
                }
                Text("Free-access features", style = MaterialTheme.typography.titleMedium)
                FeatureCatalog.all.forEach { feature ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(feature.displayName)
                        Switch(
                            checked = grantFeatures.contains(feature.id.name),
                            onCheckedChange = { checked ->
                                grantFeatures = if (checked) grantFeatures + feature.id.name
                                else grantFeatures - feature.id.name
                            }
                        )
                    }
                }
                Button(onClick = {
                    val start = System.currentTimeMillis()
                    val days = grantDays.toLongOrNull()?.coerceAtLeast(1L) ?: 1L
                    onGrant(
                        FreeGrant(
                            id = "grant-${System.currentTimeMillis()}",
                            userId = grantUserId.trim(),
                            grantedByOwnerId = "firebase-admin",
                            planId = grantPlanId.trim().ifBlank { "free" },
                            startsAtEpochMs = start,
                            expiresAtEpochMs = start + days * 86_400_000L,
                            revokedAtEpochMs = null,
                            userName = grantName.trim(),
                            email = grantEmail.trim(),
                            mobile = grantMobile.trim(),
                            featureIds = grantFeatures,
                            deviceLimit = 1,
                            autoExpire = true
                        )
                    )
                }) { Text("Approve Free Access") }

                grants.forEach { grant ->
                    val active = grant.isActive()
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(8.dp)) {
                            Text("${grant.userName.ifBlank { grant.userId }} — ${if (active) "ACTIVE" else "EXPIRED / REVOKED"}")
                            Text("Plan: ${grant.planId} • Features: ${grant.featureIds.size}/19")
                            Text("Expires: ${java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.getDefault()).format(java.util.Date(grant.expiresAtEpochMs))}")
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = {
                                    onGrantUpdate(grant.copy(expiresAtEpochMs = grant.expiresAtEpochMs + 86_400_000L))
                                }) { Text("Extend +1 day") }
                                OutlinedButton(onClick = {
                                    onGrantUpdate(grant.copy(expiresAtEpochMs = (grant.expiresAtEpochMs - 86_400_000L).coerceAtLeast(grant.startsAtEpochMs + 60_000L)))
                                }) { Text("Reduce 1 day") }
                                if (grant.revokedAtEpochMs == null) {
                                    OutlinedButton(onClick = { onGrantRevoke(grant) }) { Text("Revoke") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}



@Composable
private fun OwnerUserManagementPanel(
    users: List<OwnerManagedUser>,
    onRefresh: () -> Unit,
    onAccessSave: (OwnerManagedUser, String, Boolean, Long) -> Unit,
    onBlockToggle: (OwnerManagedUser, Boolean) -> Unit
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("User Management", style = MaterialTheme.typography.titleLarge)
                OutlinedButton(onClick = onRefresh) { Text("Refresh") }
            }
            Text("Owner-only controls for role, feature access window, and account blocking.")
            if (users.isEmpty()) {
                Text("No Firebase Auth users found.")
            } else {
                users.forEach { user ->
                    var role by remember(user.uid, user.role) { mutableStateOf(user.role) }
                    var days by remember(user.uid, user.accessExpiresAtEpochMs) {
                        mutableStateOf("30")
                    }
                    var access by remember(user.uid, user.accessGranted) {
                        mutableStateOf(user.accessGranted)
                    }
                    Card(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                        Column(Modifier.padding(10.dp)) {
                            Text(user.displayName.ifBlank { user.email.ifBlank { user.uid } })
                            if (user.email.isNotBlank()) Text(user.email)
                            if (user.phoneNumber.isNotBlank()) Text(user.phoneNumber)
                            Text("UID: " + user.uid)
                            OutlinedTextField(
                                value = role,
                                onValueChange = { role = it.uppercase() },
                                label = { Text("Role") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Access granted")
                                Switch(checked = access, onCheckedChange = { access = it })
                            }
                            OutlinedTextField(
                                value = days,
                                onValueChange = { days = it.filter(Char::isDigit) },
                                label = { Text("Access duration (days)") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = {
                                    onAccessSave(
                                        user,
                                        role.trim().ifBlank { "USER" },
                                        access,
                                        days.toLongOrNull()?.coerceAtLeast(1L) ?: 30L
                                    )
                                }) { Text("Save User") }
                                OutlinedButton(onClick = {
                                    onBlockToggle(user, !user.disabled)
                                }) {
                                    Text(if (user.disabled) "Unblock" else "Block")
                                }
                            }
                            Text("Status: " + if (user.disabled) "BLOCKED" else "ACTIVE")
                            Text("Admin claim: " + if (user.admin) "YES" else "NO")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OwnerHistoryPanel(
    history: List<OwnerSettingsHistoryEntry>,
    onRollback: (String) -> Unit
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text("Change Log & Rollback", style = MaterialTheme.typography.titleLarge)
            if (history.isEmpty()) {
                Text("No owner-setting history yet. Saving changes will create snapshots when Change Log is enabled.")
            } else {
                history.forEach { entry ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(8.dp)) {
                            Text(entry.summary)
                            Text("Changed by: ${entry.changedBy}")
                            Text(
                                java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.getDefault())
                                    .format(java.util.Date(entry.changedAtEpochMs))
                            )
                            OutlinedButton(onClick = { onRollback(entry.id) }) {
                                Text("Restore this version")
                            }
                        }
                    }
                }
            }
        }
    }

}

@Composable
private fun OwnerPaymentPanel(
    payments: List<Payment>,
    subscriptions: List<Subscription>,
    payouts: List<PayoutRecord>,
    reportTotalMinor: Long,
    onRefresh: () -> Unit,
    onVerify: (String, String) -> Unit,
    onRefund: (String) -> Unit,
    onSaveCoupon: (String, String, String, String) -> Unit,
    onRecordPayout: (String, String, String) -> Unit,
    onLoadReport: (Long, Long) -> Unit,
    gatewayProvider: String,
    gatewayMode: String,
    gatewayWebhookSecret: String,
    gatewayProviderConfig: String,
    onSaveGatewaySettings: (String, String, String, String) -> Unit
) {
    var reference by remember { mutableStateOf("") }
    var couponCode by remember { mutableStateOf("") }
    var couponPercent by remember { mutableStateOf("0") }
    var couponMinor by remember { mutableStateOf("0") }
    var couponLimit by remember { mutableStateOf("0") }
    var payoutAmount by remember { mutableStateOf("0") }
    var payoutMethod by remember { mutableStateOf("BANK_TRANSFER") }
    var payoutAccount by remember { mutableStateOf("") }
    var selectedGateway by remember(gatewayProvider) { mutableStateOf(gatewayProvider) }
    var selectedMode by remember(gatewayMode) { mutableStateOf(gatewayMode) }
    var webhookSecret by remember(gatewayWebhookSecret) { mutableStateOf(gatewayWebhookSecret) }
    var providerConfig by remember(gatewayProviderConfig) { mutableStateOf(gatewayProviderConfig) }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Payment Gateway Settings", style = MaterialTheme.typography.titleMedium)
            Text("Owner can change the active gateway and TEST/LIVE mode without changing application code. Existing payment records retain their gateway.")
            OutlinedTextField(
                selectedGateway,
                { selectedGateway = it.uppercase() },
                label = { Text("Gateway provider") },
                supportingText = { Text("TEST, RAZORPAY, STRIPE, PAYPAL, CASHFREE, PHONEPE, PAYU or CUSTOM") },
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { selectedMode = "TEST" }) { Text("TEST") }
                OutlinedButton(onClick = { selectedMode = "LIVE" }) { Text("LIVE") }
            }
            OutlinedTextField(
                webhookSecret,
                { webhookSecret = it },
                label = { Text("Webhook secret") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                providerConfig,
                { providerConfig = it },
                label = { Text("Gateway provider config (JSON)") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth()
            )
            Button(onClick = {
                onSaveGatewaySettings(
                    selectedGateway.trim().uppercase(),
                    selectedMode.trim().uppercase(),
                    webhookSecret,
                    providerConfig
                )
            }) { Text("Save Gateway Settings") }
        }
    }

    Spacer(Modifier.height(8.dp))

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Payment & Finance Management", style = MaterialTheme.typography.titleLarge)
                OutlinedButton(onClick = onRefresh) { Text("Refresh") }
            }
            Text("Secure backend ledger: payment verification, refunds, subscriptions, coupons, reports and payout records.")

            OutlinedTextField(reference, { reference = it }, label = { Text("Gateway reference for selected payment") }, modifier = Modifier.fillMaxWidth())
            payments.take(50).forEach { payment ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(8.dp)) {
                        Text("Payment " + payment.id)
                        Text("User: " + payment.userId + " • Plan: " + payment.planId)
                        Text(payment.currency + " " + (payment.amountMinor / 100.0) + " • " + payment.status)
                        Text("Gateway: " + payment.gateway)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (payment.status == Payment.Status.PENDING || payment.status == Payment.Status.CREATED) {
                                OutlinedButton(onClick = { onVerify(payment.id, reference) }, enabled = reference.isNotBlank()) {
                                    Text("Verify")
                                }
                            }
                            if (payment.status == Payment.Status.SUCCESS) {
                                OutlinedButton(onClick = { onRefund(payment.id) }) { Text("Refund") }
                            }
                        }
                    }
                }
            }

            Text("Subscriptions", style = MaterialTheme.typography.titleMedium)
            subscriptions.take(50).forEach {
                Text(it.userId + " • " + it.planId + " • " + it.status + " • expires " + it.expiresAtEpochMs)
            }

            Text("Coupon / Discount", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(couponCode, { couponCode = it.uppercase() }, label = { Text("Coupon code") }, modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(couponPercent, { couponPercent = it }, label = { Text("Discount %") }, modifier = Modifier.weight(1f))
                OutlinedTextField(couponMinor, { couponMinor = it.filter(Char::isDigit) }, label = { Text("Discount minor") }, modifier = Modifier.weight(1f))
                OutlinedTextField(couponLimit, { couponLimit = it.filter(Char::isDigit) }, label = { Text("Usage limit") }, modifier = Modifier.weight(1f))
            }
            Button(onClick = { onSaveCoupon(couponCode, couponPercent, couponMinor, couponLimit) }) { Text("Create / Save Coupon") }

            Text("Payment Report", style = MaterialTheme.typography.titleMedium)
            Button(onClick = {
                val end = System.currentTimeMillis()
                onLoadReport(end - 30L * 86_400_000L, end)
            }) { Text("Load last 30 days") }
            Text("Report total: ₹" + (reportTotalMinor / 100.0))

            Text("Payout", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(payoutAmount, { payoutAmount = it }, label = { Text("Amount ₹") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(payoutMethod, { payoutMethod = it.uppercase() }, label = { Text("Method") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(payoutAccount, { payoutAccount = it }, label = { Text("Account label") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = { onRecordPayout(payoutAmount, payoutMethod, payoutAccount) }) { Text("Record Payout") }
            payouts.take(20).forEach {
                Text("Payout " + it.id + " • ₹" + (it.amountMinor / 100.0) + " • " + it.method + " • " + it.status)
            }
        }
    }
}


private fun csvSet(value: String): Set<String> =
    value.split(",").map { it.trim() }.filter { it.isNotBlank() }.toSet()

private fun parseLongMap(value: String): Map<String, Long> =
    value.split(",").mapNotNull { item ->
        val parts = item.split("=", limit = 2)
        if (parts.size != 2) null else parts[0].trim().takeIf { it.isNotBlank() }?.let { key ->
            key to (parts[1].trim().toLongOrNull() ?: return@mapNotNull null)
        }
    }.toMap()

private fun parseIntMap(value: String): Map<String, Int> =
    value.split(",").mapNotNull { item ->
        val parts = item.split("=", limit = 2)
        if (parts.size != 2) null else parts[0].trim().takeIf { it.isNotBlank() }?.let { key ->
            key to (parts[1].trim().toIntOrNull() ?: return@mapNotNull null)
        }
    }.toMap()



@Composable
private fun PaymentGatewayPermitPanel() {
    val functions = remember { FirebaseFunctions.getInstance() }
    val scope = rememberCoroutineScope()
    var displayName by remember { mutableStateOf("Razorpay") }
    var keyId by remember { mutableStateOf("") }
    var keySecret by remember { mutableStateOf("") }
    var webhookSecret by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf("LIVE") }
    var enabled by remember { mutableStateOf(true) }
    var configured by remember { mutableStateOf(false) }
    var revision by remember { mutableStateOf(0L) }
    var updatedAt by remember { mutableStateOf(0L) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("Loading secure gateway status…") }

    suspend fun refreshStatus() {
        busy = true
        try {
            val result = functions.getHttpsCallable("getPaymentGatewayPermit").call().await().data as? Map<*, *>
            if (result != null) {
                val hasConfig = result["configured"] == true
                configured = hasConfig
                enabled = if (hasConfig) result["enabled"] == true else true
                displayName = (result["displayName"] as? String).orEmpty().ifBlank { "Razorpay" }
                mode = (result["mode"] as? String).orEmpty().ifBlank { "LIVE" }
                revision = (result["revision"] as? Number)?.toLong() ?: 0L
                updatedAt = (result["updatedAtEpochMs"] as? Number)?.toLong() ?: 0L
                message = if (configured) "Saved securely • revision $revision" else "Not configured yet"
            } else {
                message = "Could not read gateway status."
            }
        } catch (error: Exception) {
            message = error.message ?: "Unable to read gateway status. Check Owner access."
        } finally {
            busy = false
        }
    }

    LaunchedEffect(Unit) { refreshStatus() }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Permanent Gateway Permit", style = MaterialTheme.typography.titleLarge)
            Text("Owner-only setting. Change the active Razorpay credentials at any time. Credentials are encrypted on the server and are never read back into the app.")
            Text(message, style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(
                value = displayName,
                onValueChange = { displayName = it },
                label = { Text("Gateway name / display label") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            Text("Provider adapter: Razorpay (the currently implemented server adapter)")
            Text("Gateway mode")
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    RadioButton(selected = mode == "TEST", onClick = { mode = "TEST" })
                    Text("Test")
                }
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    RadioButton(selected = mode == "LIVE", onClick = { mode = "LIVE" })
                    Text("Live")
                }
            }
            OutlinedTextField(
                value = keyId,
                onValueChange = { keyId = it },
                label = { Text("Razorpay Key ID") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            OutlinedTextField(
                value = keySecret,
                onValueChange = { keySecret = it },
                label = { Text("Razorpay Key Secret") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                visualTransformation = PasswordVisualTransformation()
            )
            OutlinedTextField(
                value = webhookSecret,
                onValueChange = { webhookSecret = it },
                label = { Text("Razorpay Webhook Secret") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                visualTransformation = PasswordVisualTransformation()
            )
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
            ) {
                Text(if (enabled) "Permit enabled" else "Permit disabled")
                Switch(checked = enabled, onCheckedChange = { enabled = it })
            }
            Button(
                onClick = {
                    scope.launch {
                        busy = true
                        message = "Saving encrypted gateway settings…"
                        try {
                            functions.getHttpsCallable("savePaymentGatewayPermit").call(
                                mapOf(
                                    "provider" to "RAZORPAY",
                                    "displayName" to displayName.trim(),
                                    "mode" to mode,
                                    "enabled" to enabled,
                                    "keyId" to keyId.trim(),
                                    "keySecret" to keySecret,
                                    "webhookSecret" to webhookSecret
                                )
                            ).await()
                            keyId = ""
                            keySecret = ""
                            webhookSecret = ""
                            message = "Gateway permit saved. Secrets cleared from the form."
                            refreshStatus()
                        } catch (error: Exception) {
                            message = error.message ?: "Save failed. Check Owner access and server setup."
                        } finally {
                            busy = false
                        }
                    }
                },
                enabled = !busy && displayName.trim().length >= 2 &&
                    (!enabled || (keyId.isNotBlank() && keySecret.isNotBlank() && webhookSecret.isNotBlank())),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (busy) "Please wait…" else "Save / Replace Gateway Credentials")
            }
            OutlinedButton(
                onClick = { scope.launch { refreshStatus() } },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth()
            ) { Text("Refresh Gateway Status") }
            if (configured && updatedAt > 0L) {
                Text("Last updated: $updatedAt")
            }
            Text("Security: never place gateway secrets in APK constants, GitHub source, logs, or chat. This form sends them only to the authenticated server function.")
        }
    }
}
