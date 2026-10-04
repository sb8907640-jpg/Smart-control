package com.smartcontrol.presentation.auth

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun AuthScreen(
    onAuthenticated: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(state.user?.uid) {
        if (state.user != null) onAuthenticated()
    }
    val activity = LocalContext.current as? Activity
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (activity != null && result.resultCode != Activity.RESULT_CANCELED && result.data != null) {
            viewModel.signInWithGoogle(activity, result.data!!)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Smart Control")
        Text("Sign in to manage consent-based family safety sessions.")
        Button(
            onClick = { if (activity != null) launcher.launch(viewModel.googleIntent(activity)) },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Continue with Google") }
        OutlinedTextField(
            value = state.phoneNumber,
            onValueChange = viewModel::setPhone,
            label = { Text("Mobile number") },
            placeholder = { Text("+91XXXXXXXXXX") },
            modifier = Modifier.fillMaxWidth()
        )
        Button(
            onClick = { if (activity != null) viewModel.sendOtp(activity) },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Send OTP") }
        if (state.verificationId != null) {
            OutlinedTextField(
                value = state.otp,
                onValueChange = viewModel::setOtp,
                label = { Text("6-digit OTP") },
                modifier = Modifier.fillMaxWidth()
            )
            Button(onClick = viewModel::verifyOtp, modifier = Modifier.fillMaxWidth()) {
                Text("Verify OTP")
            }
        }
        state.error?.let { Text(it) }
        if (state.loading) CircularProgressIndicator()
    }
}
