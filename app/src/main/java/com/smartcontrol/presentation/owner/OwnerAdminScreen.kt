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
import com.smartcontrol.domain.owner.OwnerSettings
import com.smartcontrol.domain.owner.OwnerSettingsRepository
import com.smartcontrol.domain.spec.FeatureCatalog
import com.smartcontrol.domain.spec.FeatureId
import com.smartcontrol.domain.spec.MasterSpecification
import com.smartcontrol.domain.spec.PermissionMode
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class OwnerAdminViewModel @Inject constructor(
    private val repository: OwnerSettingsRepository
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

    init {
        viewModelScope.launch {
            admin = repository.isAdmin()
            if (admin == true) {
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

    fun setConnection(
        persistentPairing: Boolean = settings.masterConfig.connection.persistentPairing,
        reconnectOnNetworkChange: Boolean = settings.masterConfig.connection.reconnectOnNetworkChange,
        reconnectAfterProcessRestart: Boolean = settings.masterConfig.connection.reconnectAfterProcessRestart,
        sessionApprovalRequired: Boolean = settings.masterConfig.connection.sessionApprovalRequired
    ) {
        settings = settings.copy(
            masterConfig = settings.masterConfig.copy(
                connection = settings.masterConfig.connection.copy(
                    persistentPairing = persistentPairing,
                    reconnectOnNetworkChange = reconnectOnNetworkChange,
                    reconnectAfterProcessRestart = reconnectAfterProcessRestart,
                    sessionApprovalRequired = sessionApprovalRequired
                )
            )
        )
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

@Composable
fun OwnerAdminScreen(
    onBack: () -> Unit,
    viewModel: OwnerAdminViewModel = hiltViewModel()
) {
    val admin = viewModel.admin
    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("Owner / Admin Settings", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        when (admin) {
            null -> CircularProgressIndicator()
            false -> {
                Text("Admin access is not enabled for this signed-in account.")
                Text("Sign in with an account that has the Firebase admin custom claim.")
            }
            true -> {
                Text(
                    "Master specification v${MasterSpecification.VERSION}",
                    style = MaterialTheme.typography.titleMedium
                )
                Text("Changes are stored in ownerSettings and observed live by the app.")
                Text("Android permissions, system approval and client consent remain mandatory.")

                Spacer(Modifier.height(12.dp))
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text("Permission policy", style = MaterialTheme.typography.titleMedium)
                        Text("Choose the policy shown by the app. No silent permission grant is performed.")
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(
                                selected = viewModel.settings.masterConfig.permissions.mode == PermissionMode.ONE_BY_ONE,
                                onClick = { viewModel.setPermissionMode(PermissionMode.ONE_BY_ONE) },
                                label = { Text("One-by-one") }
                            )
                            FilterChip(
                                selected = viewModel.settings.masterConfig.permissions.mode == PermissionMode.ALLOW_ALL_BY_USER_TAP,
                                onClick = { viewModel.setPermissionMode(PermissionMode.ALLOW_ALL_BY_USER_TAP) },
                                label = { Text("Allow All by user tap") }
                            )
                        }
                        Text("Live indicator: ${viewModel.settings.masterConfig.permissions.showLiveIndicator}")
                        Text("Individual deny allowed: ${viewModel.settings.masterConfig.permissions.allowUserDenyIndividualFeature}")
                    }
                }

                Spacer(Modifier.height(8.dp))
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text("Connection policy", style = MaterialTheme.typography.titleMedium)
                        PolicySwitch(
                            "Persistent pairing",
                            viewModel.settings.masterConfig.connection.persistentPairing
                        ) { viewModel.setConnection(persistentPairing = it) }
                        PolicySwitch(
                            "Reconnect after network change",
                            viewModel.settings.masterConfig.connection.reconnectOnNetworkChange
                        ) { viewModel.setConnection(reconnectOnNetworkChange = it) }
                        PolicySwitch(
                            "Reconnect after process restart",
                            viewModel.settings.masterConfig.connection.reconnectAfterProcessRestart
                        ) { viewModel.setConnection(reconnectAfterProcessRestart = it) }
                        PolicySwitch(
                            "Session approval required",
                            viewModel.settings.masterConfig.connection.sessionApprovalRequired
                        ) { viewModel.setConnection(sessionApprovalRequired = it) }
                        Text("Session expiry: ${viewModel.settings.masterConfig.connection.sessionExpirySeconds}s")
                    }
                }

                Spacer(Modifier.height(8.dp))
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text("Notifications / content / security", style = MaterialTheme.typography.titleMedium)
                        Text("Push: ${viewModel.settings.masterConfig.notifications.pushEnabled}")
                        Text("Active-session indicator: ${viewModel.settings.masterConfig.notifications.showActiveSessionNotification}")
                        Text("Permission-revoked alert: ${viewModel.settings.masterConfig.notifications.showPermissionRevokedAlert}")
                        Text("Support text: ${viewModel.settings.masterConfig.content.supportText}")
                        Text("Stop text: ${viewModel.settings.masterConfig.content.stopText}")
                        Text("Security: ${viewModel.settings.masterConfig.security.encryptionAlgorithm}")
                        Text("Consent audit: ${viewModel.settings.masterConfig.security.consentAuditEnabled}")
                        Text("Free plan public menu: ${viewModel.settings.masterConfig.plans.freePlanVisibleInPublicMenu}")
                    }
                }

                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = viewModel::save, enabled = !viewModel.saving) {
                        Text(if (viewModel.saving) "Saving..." else "Save All Settings")
                    }
                    OutlinedButton(onClick = onBack) { Text("Back") }
                }
                viewModel.message?.let { Text(it) }

                Spacer(Modifier.height(12.dp))
                Text("19 Feature Controls", style = MaterialTheme.typography.titleLarge)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(FeatureCatalog.all) { spec ->
                        val enabled = viewModel.settings.featureOverrides[spec.id]?.enabled ?: true
                        Card(Modifier.fillMaxWidth()) {
                            Row(
                                Modifier.fillMaxWidth().padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(spec.displayName)
                                    Text("Consent: " + spec.consent.joinToString())
                                }
                                Switch(
                                    checked = enabled,
                                    onCheckedChange = { viewModel.toggle(spec.id, it) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PolicySwitch(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
