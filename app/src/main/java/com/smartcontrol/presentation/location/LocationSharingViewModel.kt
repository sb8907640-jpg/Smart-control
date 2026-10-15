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
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

@HiltViewModel
class LocationSharingViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: FirestoreLocationSharingRepository,
    private val auth: FirebaseAuth
) : ViewModel() {
    private val privacyPrefs by lazy { context.getSharedPreferences("privacy_controls", Context.MODE_PRIVATE) }
    private val _sharing = MutableStateFlow(false)
    val sharing: StateFlow<Boolean> = _sharing
    private val _lastLocation = MutableStateFlow<SharedLocation?>(null)
    val lastLocation: StateFlow<SharedLocation?> = _lastLocation
    private val _status = MutableStateFlow<String?>(null)
    val status: StateFlow<String?> = _status.asStateFlow()
    val hasPermission: Boolean
        get() = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    fun publishCurrentLocation() = viewModelScope.launch {
        val uid = auth.currentUser?.uid ?: run {
            _status.value = "Sign in before sharing your location."
            return@launch
        }
        if (!privacyPrefs.getBoolean("allow_location_sharing", true)) {
            _status.value = "Location sharing is disabled in Privacy Controls."
            return@launch
        }
        if (!hasPermission) {
            _status.value = "Allow location permission in Android Settings first."
            return@launch
        }
        try {
            val location = LocationServices.getFusedLocationProviderClient(context).lastLocation.await()
            if (location == null) {
                _status.value = "No recent location is available yet. Turn on location and try again."
                return@launch
            }
            val shared = SharedLocation(uid, location.latitude, location.longitude, location.accuracy, System.currentTimeMillis())
            repository.publish(shared)
            _lastLocation.value = shared
            _sharing.value = true
            _status.value = "Location shared successfully."
        } catch (error: Exception) {
            _status.value = error.message ?: "Could not share the current location."
        }
    }

    fun stopSharing() = viewModelScope.launch {
        val uid = auth.currentUser?.uid ?: run {
            _status.value = "Sign in before changing location sharing."
            return@launch
        }
        try {
            repository.stopSharing(uid)
            _sharing.value = false
            _lastLocation.value = null
            _status.value = "Location sharing stopped."
        } catch (error: Exception) {
            _status.value = error.message ?: "Could not stop location sharing."
        }
    }
}
