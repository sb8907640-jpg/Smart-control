package com.smartcontrol.domain.permission

enum class DevicePermission(val androidPermission: String, val label: String) {
    CAMERA("android.permission.CAMERA", "Camera"),
    MICROPHONE("android.permission.RECORD_AUDIO", "Microphone"),
    LOCATION_FINE("android.permission.ACCESS_FINE_LOCATION", "Precise Location"),
    LOCATION_COARSE("android.permission.ACCESS_COARSE_LOCATION", "Approximate Location")
}
