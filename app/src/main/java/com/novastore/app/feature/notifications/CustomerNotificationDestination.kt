package com.novastore.app.feature.notifications

import com.novastore.app.data.model.AccountOrder
import com.novastore.app.data.model.ReturnRequestDetails

sealed interface CustomerNotificationDestination {
    data class Product(val productId: Int) : CustomerNotificationDestination
    data class Order(val order: AccountOrder) : CustomerNotificationDestination
    data class ProductQuestion(val questionId: Long) : CustomerNotificationDestination
    data class ReturnRequest(val details: ReturnRequestDetails) : CustomerNotificationDestination
    data class Review(val reviewId: Long) : CustomerNotificationDestination
    data class SupportThread(val threadId: Long) : CustomerNotificationDestination
}
