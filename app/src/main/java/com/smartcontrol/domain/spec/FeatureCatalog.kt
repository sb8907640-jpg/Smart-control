package com.smartcontrol.domain.spec

enum class FeatureId {
    LOCATION,
    NOTIFICATIONS,
    BATTERY_NETWORK,
    CAMERA,
    MICROPHONE,
    GALLERY,
    SCREEN_SHARE,
    SCREEN_RECORDING,
    TOUCH_CONTROL,
    KEYBOARD_INPUT,
    APP_INSTALL,
    FILE_TRANSFER,
    CLIPBOARD_SYNC,
    FILES_ACCESS,
    CONTACTS,
    SMS,
    CALL_LOGS,
    APP_USAGE,
    SOS_ALERTS
}

enum class ConsentKind {
    RUNTIME_PERMISSION,
    SYSTEM_SPECIAL_ACCESS,
    MEDIA_PROJECTION,
    USER_SELECTED_DOCUMENT,
    USER_APPROVED_SESSION
}

data class FeatureSpec(
    val id: FeatureId,
    val displayName: String,
    val consent: Set<ConsentKind>,
    val online: Boolean = true,
    val offline: Boolean = false,
    val visibleWhileActive: Boolean = true
)

object FeatureCatalog {
    val all: List<FeatureSpec> = listOf(
        FeatureSpec(FeatureId.LOCATION, "Location", setOf(ConsentKind.RUNTIME_PERMISSION, ConsentKind.USER_APPROVED_SESSION), offline = true),
        FeatureSpec(FeatureId.NOTIFICATIONS, "Notifications", setOf(ConsentKind.SYSTEM_SPECIAL_ACCESS, ConsentKind.USER_APPROVED_SESSION), offline = true),
        FeatureSpec(FeatureId.BATTERY_NETWORK, "Battery & Network", setOf(ConsentKind.USER_APPROVED_SESSION), offline = true),
        FeatureSpec(FeatureId.CAMERA, "Camera", setOf(ConsentKind.RUNTIME_PERMISSION, ConsentKind.USER_APPROVED_SESSION)),
        FeatureSpec(FeatureId.MICROPHONE, "Microphone", setOf(ConsentKind.RUNTIME_PERMISSION, ConsentKind.USER_APPROVED_SESSION)),
        FeatureSpec(FeatureId.GALLERY, "Gallery", setOf(ConsentKind.USER_SELECTED_DOCUMENT, ConsentKind.USER_APPROVED_SESSION), offline = true),
        FeatureSpec(FeatureId.SCREEN_SHARE, "Screen Share", setOf(ConsentKind.MEDIA_PROJECTION, ConsentKind.USER_APPROVED_SESSION)),
        FeatureSpec(FeatureId.SCREEN_RECORDING, "Screen Recording", setOf(ConsentKind.MEDIA_PROJECTION, ConsentKind.USER_APPROVED_SESSION), offline = true),
        FeatureSpec(FeatureId.TOUCH_CONTROL, "Touch Control", setOf(ConsentKind.SYSTEM_SPECIAL_ACCESS, ConsentKind.USER_APPROVED_SESSION)),
        FeatureSpec(FeatureId.KEYBOARD_INPUT, "Keyboard Input", setOf(ConsentKind.SYSTEM_SPECIAL_ACCESS, ConsentKind.USER_APPROVED_SESSION)),
        FeatureSpec(FeatureId.APP_INSTALL, "App Install / Uninstall", setOf(ConsentKind.USER_SELECTED_DOCUMENT, ConsentKind.USER_APPROVED_SESSION)),
        FeatureSpec(FeatureId.FILE_TRANSFER, "File Transfer", setOf(ConsentKind.USER_SELECTED_DOCUMENT, ConsentKind.USER_APPROVED_SESSION), offline = true),
        FeatureSpec(FeatureId.CLIPBOARD_SYNC, "Clipboard Sync", setOf(ConsentKind.USER_APPROVED_SESSION), offline = true),
        FeatureSpec(FeatureId.FILES_ACCESS, "Files Access", setOf(ConsentKind.USER_SELECTED_DOCUMENT, ConsentKind.USER_APPROVED_SESSION), offline = true),
        FeatureSpec(FeatureId.CONTACTS, "Contacts", setOf(ConsentKind.RUNTIME_PERMISSION, ConsentKind.USER_APPROVED_SESSION), offline = true),
        FeatureSpec(FeatureId.SMS, "SMS", setOf(ConsentKind.RUNTIME_PERMISSION, ConsentKind.USER_APPROVED_SESSION), offline = true),
        FeatureSpec(FeatureId.CALL_LOGS, "Call Logs", setOf(ConsentKind.RUNTIME_PERMISSION, ConsentKind.USER_APPROVED_SESSION), offline = true),
        FeatureSpec(FeatureId.APP_USAGE, "App Usage", setOf(ConsentKind.SYSTEM_SPECIAL_ACCESS, ConsentKind.USER_APPROVED_SESSION), offline = true),
        FeatureSpec(FeatureId.SOS_ALERTS, "SOS Alerts", setOf(ConsentKind.USER_APPROVED_SESSION), offline = true)
    )

    init {
        check(all.size == 19) { "Master feature catalog must contain exactly 19 features." }
        check(all.map { it.id }.distinct().size == all.size) { "Feature catalog must not contain duplicate feature IDs." }
    }
}
