package com.smartcontrol.presentation.media

import android.view.ViewGroup
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.webrtc.EglBase
import org.webrtc.SurfaceViewRenderer

@Composable
fun WebRtcVideoRenderer(
    eglBase: EglBase,
    videoSink: SurfaceViewRenderer,
    modifier: Modifier = Modifier
) {
    AndroidView(
        modifier = modifier,
        factory = {
            videoSink.apply {
                init(eglBase.eglBaseContext, null)
                setEnableHardwareScaler(true)
                setMirror(false)
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            }
        },
        onRelease = { it.release() }
    )
}
