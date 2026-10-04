package com.smartcontrol.domain.feature
enum class FeatureModule(val displayName:String){
 CAMERA("Camera"),MICROPHONE("Microphone"),SCREEN_SHARING("Screen Sharing"),LOCATION("Location"),
 FILE_TRANSFER("File Transfer"),REMOTE_CONTROL("Remote Control"),DEVICE_STATUS("Device Status"),
 BATTERY_STATUS("Battery Status"),NETWORK_STATUS("Network Status"),CONTACT_SUPPORT("Family Support"),
 SESSION_APPROVAL("Session Approval"),SESSION_NOTIFICATION("Visible Session Notification"),SESSION_STOP("Stop / Disconnect"),
 AUDIT_LOG("Session Audit Log"),DEVICE_PAIRING("Device Pairing"),PERMISSION_CENTER("Permission Center"),
 SAFETY_ALERTS("Safety Alerts"),EMERGENCY_CONTACTS("Emergency Contacts"),PRIVACY_CONTROLS("Privacy Controls")
}
