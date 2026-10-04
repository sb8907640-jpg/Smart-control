package com.smartcontrol.presentation.settings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.smartcontrol.domain.security.ParentPinRepository
import com.smartcontrol.domain.session.SessionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch
data class SettingsUiState(val error:String?=null)
@HiltViewModel class SettingsViewModel @Inject constructor(private val pins:ParentPinRepository,private val sessions:SessionRepository):ViewModel(){
 var state=androidx.compose.runtime.mutableStateOf(SettingsUiState()); private set
 fun verifyAndEndSession(pin:String,onSuccess:()->Unit){viewModelScope.launch{state.value=SettingsUiState();if(!pins.verifyPin(pin)){state.value=SettingsUiState("Invalid Parent PIN.");return@launch};sessions.stopActiveSession();onSuccess()}}
}