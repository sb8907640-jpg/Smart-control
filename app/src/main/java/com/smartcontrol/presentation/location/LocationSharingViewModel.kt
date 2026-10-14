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
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
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
    val status: StateFlow<String?> = _status

    init {
        // Do not show one account's previously shared coordinates after an account switch.
        viewModelScope.launch {
            callbackFlow {
                val listener = FirebaseAuth.AuthStateListener { state ->
                    trySend(state.currentUser?.uid)
                }
                auth.addAuthStateListener(listener)
                trySend(auth.currentUser?.uid)
                awaitClose { auth.removeAuthStateListener(listener) }
            }.distinctUntilChanged().collect {
                _sharing.value = false
                _lastLocation.value = null
                _status.value = null
            }
        }
    }

    val hasPermission: Boolean
        get() = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    fun publishCurrentLocation() = viewModelScope.launch {
        _status.value = null
        val uid = auth.currentUser?.uid ?: run {
            _status.value = "Sign in before sharing location."
            return@launch
        }
        if (!privacyPrefs.getBoolean("allow_location_sharing", true)) {
            _status.value = "Location sharing is disabled in Privacy Controls."
            return@launch
        }
        if (!hasPermission) {
            _status.value = "Allow location permission in Android settings before sharing."
            return@launch
        }

        val fused = LocationServices.getFusedLocationProviderClient(context)
        val location = runCatching {
            fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token).await()
        }.getOrNull() ?: runCatching { fused.lastLocation.await() }.getOrNull()
            ?: run {
                _status.value = "Could not get a location fix. Check that Location is enabled and try again."
                return@launch
            }

        val shared = SharedLocation(uid, location.latitude, location.longitude, location.accuracy, System.currentTimeMillis())
        runCatching { repository.publish(shared) }
            .onSuccess {
                _lastLocation.value = shared
                _sharing.value = true
                _status.value = "Location shared successfully."
            }
            .onFailure {
                _status.value = it.message ?: "Could not save the shared location."
            }
    }

    fun stopSharing() = viewModelScope.launch {
        val uid = auth.currentUser?.uid ?: run {
            _status.value = "Sign in before changing location sharing."
            return@launch
        }
        runCatching { repository.stopSharing(uid) }
            .onSuccess {
                _sharing.value = false
                _status.value = "Location sharing stopped."
            }
            .onFailure {
                _status.value = it.message ?: "Could not stop location sharing."
            }
    }
}
