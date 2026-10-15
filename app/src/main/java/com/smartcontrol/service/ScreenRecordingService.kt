package com.smartcontrol.service

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.Manifest
import android.content.pm.PackageManager
import android.content.ContentValues
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.smartcontrol.MainActivity
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Explicit, local screen recorder. Every session requires a fresh Android
 * MediaProjection consent token and remains visible through an ongoing notice.
 */
class ScreenRecordingService : Service() {
    private var projection: MediaProjection? = null
    private var recorder: MediaRecorder? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var outputUri: Uri? = null
    private var outputDescriptor: ParcelFileDescriptor? = null
    private var outputFile: File? = null
    private var recordingStarted = false
    private var stopping = false
    private var failureMessage: String? = null

    private val projectionCallback = object : MediaProjection.Callback() {
        override fun onStop() {
            stopRecording(stopProjection = false)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopRecording()
                return START_NOT_STICKY
            }
            ACTION_START -> {
                // Ignore duplicate starts so a rapid second tap cannot replace an
                // active projection/recorder or leak its file descriptor.
                if (recordingStarted || projection != null || stopping) return START_NOT_STICKY
                startRecording(intent)
            }
            else -> return START_NOT_STICKY
        }
        return START_NOT_STICKY
    }

    private fun startRecording(intent: Intent) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            failureMessage = "Notification permission is required for visibly indicated screen recording."
            stopRecording()
            return
        }
        try {
            createChannel()
            val notification = buildNotification()
            val serviceType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            } else 0
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, serviceType)

            val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
            val resultData = readResultData(intent)
            require(resultCode == Activity.RESULT_OK && resultData != null) {
                "Android screen-capture consent was not granted."
            }
            val manager = getSystemService(MediaProjectionManager::class.java)
                ?: error("MediaProjection service is unavailable.")
            val activeProjection = manager.getMediaProjection(resultCode, resultData)
                ?: error("Android did not provide a screen-capture projection.")
            projection = activeProjection
            activeProjection.registerCallback(projectionCallback, Handler(Looper.getMainLooper()))

            val metrics = resources.displayMetrics
            val width = (metrics.widthPixels.coerceAtLeast(2) / 2) * 2
            val height = (metrics.heightPixels.coerceAtLeast(2) / 2) * 2
            val densityDpi = metrics.densityDpi.coerceAtLeast(1)
            prepareOutput()

            @Suppress("DEPRECATION")
            val mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                MediaRecorder()
            }
            recorder = mediaRecorder
            mediaRecorder.setVideoSource(MediaRecorder.VideoSource.SURFACE)
            mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            mediaRecorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
            mediaRecorder.setVideoSize(width, height)
            mediaRecorder.setVideoFrameRate(30)
            mediaRecorder.setVideoEncodingBitRate(5_000_000)
            val descriptor = outputDescriptor
            if (descriptor != null) mediaRecorder.setOutputFile(descriptor.fileDescriptor)
            else mediaRecorder.setOutputFile(requireNotNull(outputFile).absolutePath)
            mediaRecorder.prepare()
            virtualDisplay = activeProjection.createVirtualDisplay(
                "FamilySurakshaScreenRecording",
                width,
                height,
                densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                mediaRecorder.surface,
                null,
                null
            ) ?: error("Could not create the screen recording display.")
            mediaRecorder.start()
            recordingStarted = true
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putBoolean(KEY_ACTIVE, true)
                .putString(KEY_ERROR, "")
                .apply()
        } catch (error: Exception) {
            failureMessage = error.message ?: "Screen recording could not start."
            stopRecording()
        }
    }

    private fun prepareOutput() {
        val timestamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        val fileName = "FamilySuraksha-$timestamp.mp4"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
                put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_MOVIES + "/Family Suraksha"
                )
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            outputUri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
                ?: error("Could not create the screen recording file.")
            outputDescriptor = contentResolver.openFileDescriptor(requireNotNull(outputUri), "w")
                ?: error("Could not open the screen recording file.")
        } else {
            val directory = File(getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: filesDir, "FamilySuraksha")
            if (!directory.exists() && !directory.mkdirs()) error("Could not create the recording folder.")
            outputFile = File(directory, fileName)
        }
    }

    private fun stopRecording(stopProjection: Boolean = true) {
        if (stopping) return
        stopping = true
        val wasRecording = recordingStarted
        val stoppedCleanly = if (wasRecording) {
            runCatching {
                recorder?.stop()
                true
            }.getOrDefault(false)
        } else false

        runCatching { virtualDisplay?.release() }
        virtualDisplay = null
        runCatching { recorder?.reset() }
        runCatching { recorder?.release() }
        recorder = null
        runCatching { projection?.unregisterCallback(projectionCallback) }
        if (stopProjection) runCatching { projection?.stop() }
        projection = null
        runCatching { outputDescriptor?.close() }
        outputDescriptor = null

        val savedReference = if (stoppedCleanly) {
            outputUri?.let { uri ->
                runCatching {
                    contentResolver.update(
                        uri,
                        ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) },
                        null,
                        null
                    )
                }
                uri.toString()
            } ?: outputFile?.absolutePath
        } else null

        if (!stoppedCleanly) {
            outputUri?.let { runCatching { contentResolver.delete(it, null, null) } }
            outputFile?.let { runCatching { it.delete() } }
        }

        val errorText = when {
            failureMessage != null -> failureMessage
            wasRecording && !stoppedCleanly -> "Recording stopped before a playable file could be saved."
            else -> ""
        }
        val preferencesEditor = getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putBoolean(KEY_ACTIVE, false)
            .putString(KEY_ERROR, errorText)
        if (savedReference != null) preferencesEditor.putString(KEY_LAST_RECORDING, savedReference)
        preferencesEditor.apply()
        recordingStarted = false
        outputUri = null
        outputFile = null
        failureMessage = null
        runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
        stopSelf()
    }

    @Suppress("DEPRECATION")
    private fun readResultData(intent: Intent): Intent? =
        if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            intent.getParcelableExtra(EXTRA_RESULT_DATA)
        }

    private fun buildNotification(): Notification {
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopIntent = PendingIntent.getService(
            this,
            STOP_REQUEST_CODE,
            Intent(this, ScreenRecordingService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle("Family Suraksha screen recording")
            .setContentText("Recording is active on this device. Tap Stop to finish and save.")
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_media_pause, "Stop", stopIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "Screen recording", NotificationManager.IMPORTANCE_LOW)
            )
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        if (!stopping) stopRecording()
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "com.smartcontrol.screenrecording.START"
        const val ACTION_STOP = "com.smartcontrol.screenrecording.STOP"
        const val EXTRA_RESULT_CODE = "screen_recording_result_code"
        const val EXTRA_RESULT_DATA = "screen_recording_result_data"
        const val PREFS = "screen_recording"
        const val KEY_ACTIVE = "active"
        const val KEY_LAST_RECORDING = "last_recording"
        const val KEY_ERROR = "last_error"
        private const val CHANNEL = "screen_recording"
        private const val NOTIFICATION_ID = 1003
        private const val STOP_REQUEST_CODE = 1004
    }
}
