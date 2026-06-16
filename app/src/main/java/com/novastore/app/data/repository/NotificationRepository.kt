package com.novastore.app.data.repository

import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.data.model.Notification
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationRepository @Inject constructor(
    private val api: NovaStoreApi
) {
    suspend fun getNotifications(userId: Int): Result<List<Notification>> = runCatching {
        api.getNotifications(userId)
    }

    suspend fun markAsRead(id: Int): Result<Unit> = runCatching {
        api.markNotificationRead(id)
    }

    suspend fun markAllAsRead(userId: Int): Result<Unit> = runCatching {
        api.markAllNotificationsRead(userId)
    }
}
