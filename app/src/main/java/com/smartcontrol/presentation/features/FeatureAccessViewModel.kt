package com.smartcontrol.presentation.features

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.smartcontrol.data.owner.FirestoreFeaturePolicyRepository
import com.smartcontrol.domain.spec.FeaturePolicy
import com.smartcontrol.domain.spec.FeatureId
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    private val _settings = MutableStateFlow<OwnerSettings?>(null)
    val settings = _settings.asStateFlow()

    init {
        viewModelScope.launch {
            runCatching {
                repository.observe().collect { _settings.value = it }
            }
        }
    }

    fun isEnabled(featureId: FeatureId, userId: String): Boolean {
        val current = _settings.value ?: return false
        if (!current.globalFeaturesEnabled || !current.globalEnabled) return false
        if (current.featureOverrides[featureId] == false) return false
        if (current.globalFeatureOverrides[featureId] == false) return false

        val perUser = current.perUser[userId] ?: return true
        if (!perUser.enabled) return false
        return perUser.featureOverrides[featureId] != false
    }
}
