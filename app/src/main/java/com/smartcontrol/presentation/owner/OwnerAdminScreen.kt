package com.smartcontrol.presentation.owner

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.smartcontrol.domain.owner.FeatureOverride
import com.smartcontrol.data.billing.OwnerBillingRepository
import com.smartcontrol.data.billing.OwnerProfile
import com.smartcontrol.domain.billing.FreeGrant
import com.smartcontrol.domain.billing.Plan
import com.smartcontrol.domain.owner.OwnerSettings
import com.smartcontrol.domain.owner.OwnerSettingsRepository
import com.smartcontrol.domain.owner.OwnerSettingsHistoryEntry
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
    private val billingRepository: OwnerBillingRepository
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

    init {
        viewModelScope.launch {
            admin = repository.isAdmin()
            if (admin == true) {
                ownerProfile = runCatching { billingRepository.getOwnerProfile() }.getOrDefault(OwnerProfile())
                launch { billingRepository.observePlans().collect { plans = it } }
                launch { billingRepository.observeFreeGrants().collect { freeGrants = it } }
                launch { repository.observeHistory().collect { history = it } }
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
    "language" to "15. Language Settings"
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
                            onGrant = viewModel::grantFreeAccess,
                            onGrantUpdate = viewModel::updateFreeAccess,
                            onGrantRevoke = viewModel::revokeFreeAccess
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
            values.filterKeys { it.startsWith("$prefix.") }.forEach { (key, value) ->
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
    var planPrice by remember { mutableStateOf("0") }
    var planDuration by remember { mutableStateOf("30") }
    var planEnabled by remember { mutableStateOf(true) }
    var selectedFeatures by remember { mutableStateOf(emptySet<String>()) }
    var selectedPlanId by remember { mutableStateOf<String?>(null) }

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
                Text("Owner can create, edit, enable/disable and delete plans. Feature switches below control which of the 19 master features the plan permits.")
                OutlinedTextField(planId, { planId = it }, label = { Text("Plan ID") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planName, { planName = it }, label = { Text("Plan name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planPrice, { planPrice = it }, label = { Text("Price ₹") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(planDuration, { planDuration = it }, label = { Text("Duration days") }, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { planDuration = "30" }) { Text("30 days") }
                    Button(onClick = { planDuration = "90" }) { Text("90 days") }
                    Button(onClick = { planDuration = "365" }) { Text("365 days") }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Plan enabled")
                    Switch(planEnabled, { planEnabled = it })
                }
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
                    val id = planId.trim().ifBlank { "plan-${System.currentTimeMillis()}" }
                    onPlanSave(
                        Plan(
                            id = id,
                            name = planName.ifBlank { id },
                            description = "",
                            priceMinor = ((planPrice.toDoubleOrNull() ?: 0.0) * 100).toLong(),
                            durationDays = planDuration.toIntOrNull() ?: 30,
                            enabled = planEnabled,
                            featureIds = selectedFeatures,
                            deviceLimit = 1,
                            userLimit = 1,
                            storageLimitBytes = 0L,
                            bandwidthLimitBytes = 0L
                        )
                    )
                }) { Text("Create / Save Plan") }

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
                                    planPrice = (plan.priceMinor / 100.0).toString()
                                    planDuration = plan.durationDays.toString()
                                    planEnabled = plan.enabled
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
