package com.smartcontrol.domain.variant

enum class AppVariant(val key: String, val desktop: Boolean) {
    OWNER("OWNER", false),
    LITE("LITE", false),
    FULL("FULL", false),
    DESKTOP("DESKTOP", true);

    companion object {
        fun fromBuildVariant(value: String): AppVariant =
            entries.firstOrNull { it.key == value.uppercase() } ?: FULL
    }
}
