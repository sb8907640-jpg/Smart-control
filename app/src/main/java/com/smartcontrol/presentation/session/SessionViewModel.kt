package com.smartcontrol.presentation.session
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.smartcontrol.domain.session.*
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
@HiltViewModel class SessionViewModel @Inject constructor(private val repository:SessionRepository):ViewModel(){
 val pending=repository.pendingRequests.stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val active=repository.activeSession.stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),null)
 fun demoRequest()=viewModelScope.launch{repository.requestSession(SessionRequest(UUID.randomUUID().toString(),"demo-controller","this-device",setOf(SessionCapability.LOCATION),"Family safety check",System.currentTimeMillis()))}
 fun approve(id:String)=viewModelScope.launch{repository.approve(id)}
 fun deny(id:String)=viewModelScope.launch{repository.deny(id)}
}