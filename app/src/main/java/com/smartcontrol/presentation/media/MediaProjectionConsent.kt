package com.smartcontrol.presentation.media

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

@Composable
fun rememberMediaProjectionConsentLauncher(
    onResult: (Intent?) -> Unit
): () -> Unit {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        onResult(if (result.resultCode == Activity.RESULT_OK) result.data else null)
    }
    return remember(context, launcher) {
        {
            val manager = context.getSystemService(MediaProjectionManager::class.java)
            launcher.launch(manager.createScreenCaptureIntent())
        }
    }
}
