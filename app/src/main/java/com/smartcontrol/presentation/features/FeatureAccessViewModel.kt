package com.smartcontrol.presentation.features

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.smartcontrol.data.owner.FirestoreFeaturePolicyRepository
import com.smartcontrol.domain.spec.FeaturePolicy
import com.smartcontrol.domain.spec.FeatureId
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.awaitClose
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Single client-side projection of owner feature policy.
 *
 * This is an availability gate, not a substitute for Android permissions,
 * session consent, or backend authorization for sensitive operations.
 */
@HiltViewModel
class FeatureAccessViewModel @Inject constructor(
    private val repository: FirestoreFeaturePolicyRepository
) : ViewModel() {
    private val _settings = MutableStateFlow<FeaturePolicy?>(null)
    val settings = _settings.asStateFlow()

    init {
        viewModelScope.launch {
            val auth = FirebaseAuth.getInstance()
            callbackFlow {
                val listener = FirebaseAuth.AuthStateListener { state ->
                    trySend(state.currentUser != null)
                }
                auth.addAuthStateListener(listener)
                trySend(auth.currentUser != null)
                awaitClose { auth.removeAuthStateListener(listener) }
            }.distinctUntilChanged()
                .flatMapLatest { signedIn ->
                    if (signedIn) repository.observe().map<FeaturePolicy, FeaturePolicy?> { it }
                    else flowOf(null)
                }
                .collect { _settings.value = it }
        }
    }

    fun isGloballyEnabled(featureId: FeatureId): Boolean {
        val current = _settings.value ?: return false
        return current.globalFeaturesEnabled &&
            current.globalEnabled &&
            current.featureOverrides[featureId] != false &&
            current.globalFeatureOverrides[featureId] != false
    }

    fun isEnabled(featureId: FeatureId, userId: String): Boolean {
        if (!isGloballyEnabled(featureId)) return false
        val perUser = _settings.value?.userPolicy ?: return true
        if (!perUser.enabled) return false
        if (perUser.expiresAtEpochMs?.let { it <= System.currentTimeMillis() } == true) return false
        return perUser.featureOverrides[featureId] != false
    }
}
