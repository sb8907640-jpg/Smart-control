package com.smartcontrol.presentation.auth

import android.app.Activity
import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseUser
import com.smartcontrol.domain.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

data class AuthUiState(
    val user: FirebaseUser? = null,
    val phoneNumber: String = "",
    val otp: String = "",
    val verificationId: String? = null,
    val loading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val repository: AuthRepository
) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.currentUser.collectLatest { user -> _state.value = _state.value.copy(user = user) }
        }
    }

    fun setPhone(value: String) { _state.value = _state.value.copy(phoneNumber = value, error = null) }
    fun setOtp(value: String) { _state.value = _state.value.copy(otp = value.filter(Char::isDigit).take(6), error = null) }

    fun googleIntent(activity: Activity): Intent = repository.googleSignInIntent(activity)

    fun signInWithGoogle(activity: Activity, intent: Intent) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            repository.signInWithGoogle(activity, intent)
                .onFailure { _state.value = _state.value.copy(error = it.message ?: "Google sign-in failed.") }
            _state.value = _state.value.copy(loading = false)
        }
    }

    fun sendOtp(activity: Activity) {
        val phone = _state.value.phoneNumber.trim()
        if (!phone.startsWith("+") || phone.length < 10) {
            _state.value = _state.value.copy(error = "Enter a valid phone number with country code.")
            return
        }
        _state.value = _state.value.copy(loading = true, error = null)
        repository.sendOtp(activity, phone,
            onCodeSent = { id -> _state.value = _state.value.copy(loading = false, verificationId = id) },
            onFailure = { e -> _state.value = _state.value.copy(loading = false, error = e.message ?: "OTP failed.") }
        )
    }

    fun verifyOtp() {
        val id = _state.value.verificationId ?: return
        val code = _state.value.otp
        if (code.length != 6) {
            _state.value = _state.value.copy(error = "Enter the 6-digit OTP.")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            repository.verifyOtp(id, code).onFailure {
                _state.value = _state.value.copy(error = it.message ?: "OTP verification failed.")
            }
            _state.value = _state.value.copy(loading = false)
        }
    }

    fun signOut() = repository.signOut()
}
