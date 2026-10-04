package com.smartcontrol.presentation.settings
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
@Composable fun SettingsScreen(onBack:()->Unit,onEndSession:()->Unit,viewModel:SettingsViewModel=hiltViewModel()){
 val ui by viewModel.state; var pin by remember{mutableStateOf("")}
 Column(Modifier.fillMaxSize().padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Text("Settings",style=MaterialTheme.typography.headlineSmall)
  Text("Session controls are protected here.")
  OutlinedTextField(pin,{pin=it.filter(Char::isDigit).take(4)},label={Text("Parent PIN")},singleLine=true)
  Button({viewModel.verifyAndEndSession(pin,onEndSession)},enabled=pin.length==4){Text("End remote support session")}
  ui.error?.let{Text(it)}
  Button(onClick=onBack){Text("Back")}
 }
}