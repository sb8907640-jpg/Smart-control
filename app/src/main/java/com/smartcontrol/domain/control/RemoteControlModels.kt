package com.smartcontrol.domain.control

import java.util.UUID

enum class RemoteCommandType {
    REQUEST_TOUCH,
    REQUEST_KEYBOARD,
    OPEN_APP,
    NAVIGATE_BACK,
    NAVIGATE_HOME,
    REQUEST_INSTALL
}

data class RemoteCommand(
    val commandId: String = UUID.randomUUID().toString(),
    val sessionId: String,
    val requesterId: String,
    val targetDeviceId: String,
    val type: RemoteCommandType,
    val payload: Map<String, String>,
    val createdAtEpochMs: Long,
    val expiresAtEpochMs: Long
)

interface RemoteCommandRepository {
    suspend fun enqueue(command: RemoteCommand): Result<Unit>
    suspend fun cancel(commandId: String): Result<Unit>
}

interface RemoteCommandPolicy {
    fun canExecute(command: RemoteCommand, activeSessionId: String?, accessibilityEnabled: Boolean): Boolean
}
