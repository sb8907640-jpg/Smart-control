package com.smartcontrol.presentation.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
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
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message
    val hasPermission: Boolean
        get() = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    fun publishCurrentLocation() = viewModelScope.launch {
        _message.value = null
        try {
            val uid = auth.currentUser?.uid
            if (uid.isNullOrBlank()) {
                _message.value = "Sign in before sharing your location."
                return@launch
            }
            if (!privacyPrefs.getBoolean("allow_location_sharing", true)) {
                _message.value = "Location sharing is disabled in Privacy Controls."
                return@launch
            }
            if (!hasPermission) {
                _message.value = "Location permission is required."
                return@launch
            }
            val client = LocationServices.getFusedLocationProviderClient(context)
            val location = client.lastLocation.await()
                ?: client.getCurrentLocation(
                    Priority.PRIORITY_HIGH_ACCURACY,
                    CancellationTokenSource().token
                ).await()
            if (location == null) {
                _message.value = "Could not get a current location. Check GPS and try again."
                return@launch
            }
            val shared = SharedLocation(
                uid,
                location.latitude,
                location.longitude,
                location.accuracy,
                System.currentTimeMillis()
            )
            repository.publish(shared)
            _lastLocation.value = shared
            _sharing.value = true
            _message.value = "Location shared successfully."
        } catch (error: Exception) {
            _message.value = error.message ?: "Could not share location."
        }
    }

    fun stopSharing() = viewModelScope.launch {
        _message.value = null
        try {
            val uid = auth.currentUser?.uid
            if (uid.isNullOrBlank()) {
                _message.value = "Sign in before stopping location sharing."
                return@launch
            }
            repository.stopSharing(uid)
            _sharing.value = false
            _message.value = "Location sharing stopped."
        } catch (error: Exception) {
            _message.value = error.message ?: "Could not stop location sharing."
        }
    }
}
