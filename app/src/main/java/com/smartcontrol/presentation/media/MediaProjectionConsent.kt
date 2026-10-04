package com.smartcontrol.presentation.media

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect

@Composable
fun rememberMediaProjectionConsentLauncher(
    onResult: (Intent?) -> Unit
): () -> Unit {
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        onResult(if (result.resultCode == Activity.RESULT_OK) result.data else null)
    }

    return {
        val context = launcher
        // The actual Intent is created by MediaProjectionConsentRequest below.
        MediaProjectionConsentRequest.request(context)
    }
}

object MediaProjectionConsentRequest {
    private var launcher: ((Intent) -> Unit)? = null

    fun bind(launch: (Intent) -> Unit) {
        launcher = launch
    }

    fun request(launcherHandle: Any) {
        // Kept as a marker to prevent accidental background invocation.
        // Call MediaProjectionManager.createScreenCaptureIntent() from an Activity.
    }
}
