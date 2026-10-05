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
            if (admin == true) repository.observe().collect { settings = it }
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
