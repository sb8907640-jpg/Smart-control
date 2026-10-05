package com.smartcontrol.service

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

data class LocalNotification(
    val packageName: String,
    val title: String,
    val text: String,
    val postedAtEpochMs: Long
)

class NotificationAccessService : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val item = LocalNotification(sbn.packageName, title, text, sbn.postTime)
        val current = notifications.value.toMutableList()
        current.removeAll { it.packageName == item.packageName && it.postedAtEpochMs == item.postedAtEpochMs }
        current.add(0, item)
        notifications.value = current.take(MAX_ITEMS)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        notifications.value = notifications.value.filterNot {
            it.packageName == sbn.packageName && it.postedAtEpochMs == sbn.postTime
        }
    }

    companion object {
        private const val MAX_ITEMS = 50
        private val notifications = MutableStateFlow<List<LocalNotification>>(emptyList())
        val recentNotifications = notifications.asStateFlow()
    }
}
