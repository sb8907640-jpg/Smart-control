package com.smartcontrol.presentation.owner
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.domain.owner.FeatureOverride
import com.smartcontrol.domain.owner.OwnerSettings
import com.smartcontrol.domain.owner.OwnerSettingsRepository
import com.smartcontrol.domain.spec.FeatureCatalog
import com.smartcontrol.domain.spec.FeatureId
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class OwnerAdminViewModel @Inject constructor(
    private val repository: OwnerSettingsRepository
) : ViewModel() {
    var admin by mutableStateOf<Boolean?>(null)
        private set
    var settings by mutableStateOf(OwnerSettings(true, emptyMap(), emptyList(), true, false, false, true, true, false, true))
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
        settings = settings.copy(featureOverrides = settings.featureOverrides + (featureId to current.copy(enabled = enabled)))
    }

    fun save() {
        androidx.lifecycle.viewModelScope.launch {
            saving = true
            message = repository.save(settings).fold({ "Settings saved." }, { it.message ?: "Save failed." })
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
                val user = FirebaseAuth.getInstance().currentUser
                Text("Owner login identity", style = MaterialTheme.typography.titleMedium)
                Text("UID: " + (user?.uid ?: "Unavailable"))
                user?.email?.let { Text("Email: " + it) }
                user?.phoneNumber?.let { Text("Phone: " + it) }
                Text("Signed-in admin controls availability and policy. Android permissions and user consent remain required.")
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = viewModel::save, enabled = !viewModel.saving) {
                        Text(if (viewModel.saving) "Saving..." else "Save")
                    }
                    OutlinedButton(onClick = onBack) { Text("Back") }
                }
                viewModel.message?.let { Text(it) }
                Spacer(Modifier.height(12.dp))
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
                                Switch(checked = enabled, onCheckedChange = { viewModel.toggle(spec.id, it) })
                            }
                        }
                    }
                }
            }
        }
    }
}
