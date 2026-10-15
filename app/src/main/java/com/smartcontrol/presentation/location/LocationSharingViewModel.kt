package com.smartcontrol.presentation.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.location.LocationServices
import com.smartcontrol.data.location.FirestoreLocationSharingRepository
import com.smartcontrol.domain.location.SharedLocation
import com.smartcontrol.domain.pairing.PairingRepository
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

@HiltViewModel
class LocationSharingViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: FirestoreLocationSharingRepository,
    private val auth: FirebaseAuth,
    pairingRepository: PairingRepository
) : ViewModel() {
    private val privacyPrefs by lazy { context.getSharedPreferences("privacy_controls", Context.MODE_PRIVATE) }
    private val _sharing = MutableStateFlow(false)
    val sharing: StateFlow<Boolean> = _sharing
    private val _lastLocation = MutableStateFlow<SharedLocation?>(null)
    val lastLocation: StateFlow<SharedLocation?> = _lastLocation
    private val _remoteLocations = MutableStateFlow<List<SharedLocation>>(emptyList())
    val remoteLocations: StateFlow<List<SharedLocation>> = _remoteLocations.asStateFlow()
    val hasPermission: Boolean
        get() = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    init {
        viewModelScope.launch {
            pairingRepository.observeControlledDevices()
                .map { devices -> devices.map { it.deviceUid }.filter(String::isNotBlank).distinct() }
                .distinctUntilChanged()
                .flatMapLatest { deviceIds ->
                    if (deviceIds.isEmpty()) flowOf(emptyList())
                    else combine(deviceIds.map { id -> repository.observe(id) }) { locations ->
                        locations.filterNotNull().sortedByDescending { it.capturedAtEpochMs }
                    }
                }
                .collect { _remoteLocations.value = it }
        }
    }

    @SuppressLint("MissingPermission")
    fun publishCurrentLocation() = viewModelScope.launch {
        val uid = auth.currentUser?.uid ?: return@launch
        if (!privacyPrefs.getBoolean("allow_location_sharing", true)) return@launch
        if (!hasPermission) return@launch
        val location = LocationServices.getFusedLocationProviderClient(context).lastLocation.await() ?: return@launch
        val shared = SharedLocation(uid, location.latitude, location.longitude, location.accuracy, System.currentTimeMillis())
        repository.publish(shared)
        _lastLocation.value = shared
        _sharing.value = true
    }

    fun stopSharing() = viewModelScope.launch {
        val uid = auth.currentUser?.uid ?: return@launch
        repository.stopSharing(uid)
        _sharing.value = false
    }
}
