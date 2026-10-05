package com.smartcontrol.presentation.emergency
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
import com.smartcontrol.domain.emergency.EmergencyContact
import com.smartcontrol.domain.emergency.EmergencyContactRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch
import java.util.UUID

@HiltViewModel
class EmergencyContactsViewModel @Inject constructor(
    private val repository: EmergencyContactRepository
) : ViewModel() {
    var contacts by mutableStateOf(emptyList<EmergencyContact>())
        private set
    var name by mutableStateOf("")
    var phone by mutableStateOf("")
    var message by mutableStateOf<String?>(null)
        private set

    fun load(uid: String) {
        viewModelScope.launch { contacts = repository.list(uid) }
    }

    fun add(uid: String) {
        viewModelScope.launch {
            message = repository.save(
                EmergencyContact(UUID.randomUUID().toString(), uid, name.trim(), phone.trim())
            ).fold(
                { name = ""; phone = ""; load(uid); "Contact saved." },
                { it.message ?: "Save failed." }
            )
        }
    }
}

@Composable
fun EmergencyContactsScreen(
    ownerUid: String,
    onBack: () -> Unit,
    viewModel: EmergencyContactsViewModel = hiltViewModel()
) {
    LaunchedEffect(ownerUid) { viewModel.load(ownerUid) }
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Emergency Contacts", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(viewModel.name, { viewModel.name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(viewModel.phone, { viewModel.phone = it }, label = { Text("Phone") }, modifier = Modifier.fillMaxWidth())
        Button(
            onClick = { viewModel.add(ownerUid) },
            enabled = viewModel.name.isNotBlank() && viewModel.phone.isNotBlank()
        ) { Text("Add Contact") }
        viewModel.message?.let { Text(it) }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(viewModel.contacts) { contact ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(contact.name)
                        Text(contact.phoneNumber)
                    }
                }
            }
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
