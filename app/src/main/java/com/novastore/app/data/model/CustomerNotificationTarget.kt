package com.novastore.app.data.model

private const val MAX_ANDROID_ENTITY_ID = Int.MAX_VALUE.toLong()

sealed interface CustomerNotificationTarget {
    val entityId: Long

    data class Order(override val entityId: Long) : CustomerNotificationTarget
    data class Product(override val entityId: Long) : CustomerNotificationTarget
    data class ProductQuestion(override val entityId: Long) : CustomerNotificationTarget
    data class ReturnRequest(override val entityId: Long) : CustomerNotificationTarget
    data class Review(override val entityId: Long) : CustomerNotificationTarget
    data class SupportThread(override val entityId: Long) : CustomerNotificationTarget
}

/**
 * Resolves only the server-owned Main-6S entity pair. URL-like notification fields are not
 * represented by the Android DTO and can never participate in navigation.
 */
fun Notification.customerTargetOrNull(): CustomerNotificationTarget? {
    val id = entityId?.takeIf { it in 1..MAX_ANDROID_ENTITY_ID } ?: return null
    return when (entityType?.trim()) {
        "order" -> CustomerNotificationTarget.Order(id)
        "product" -> CustomerNotificationTarget.Product(id)
        "product_question" -> CustomerNotificationTarget.ProductQuestion(id)
        "return_request" -> CustomerNotificationTarget.ReturnRequest(id)
        "review" -> CustomerNotificationTarget.Review(id)
        "support_thread" -> CustomerNotificationTarget.SupportThread(id)
        else -> null
    }
}
