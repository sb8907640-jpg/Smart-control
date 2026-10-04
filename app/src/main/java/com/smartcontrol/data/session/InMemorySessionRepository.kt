package com.smartcontrol.data.session
import com.smartcontrol.domain.session.*
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
@Singleton class InMemorySessionRepository @Inject constructor(): SessionRepository {
 private val mutex=Mutex(); private val requests=MutableStateFlow<List<SessionRequest>>(emptyList()); private val active=MutableStateFlow<RemoteSession?>(null)
 override val pendingRequests=requests.asStateFlow(); override val activeSession=active.asStateFlow()
 override suspend fun requestSession(request:SessionRequest)=mutex.withLock{requests.value=requests.value+request}
 override suspend fun approve(requestId:String)=mutex.withLock{val r=requests.value.firstOrNull{it.sessionId==requestId}?:return; requests.value=requests.value.filterNot{it.sessionId==requestId}; active.value=RemoteSession(r,SessionStatus.ACTIVE)}
 override suspend fun deny(requestId:String)=mutex.withLock{requests.value=requests.value.filterNot{it.sessionId==requestId}}
 override suspend fun stopActiveSession()=mutex.withLock{active.value=null}
}