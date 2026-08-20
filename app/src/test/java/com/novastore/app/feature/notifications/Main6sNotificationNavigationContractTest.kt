package com.novastore.app.feature.notifications

import com.novastore.app.data.model.AccountOrder
import com.novastore.app.data.model.AccountOrderItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Main6sNotificationNavigationContractTest {
    @Test
    fun notificationTargetsReturnToTheNotificationInbox() {
        assertEquals(
            AccountPage.Notifications,
            accountBackDestination(AccountPage.OrderDetail, AccountPage.Notifications)
        )
        assertEquals(
            AccountPage.Center,
            accountBackDestination(AccountPage.OrderDetail, null)
        )
    }

    @Test
    fun onlyTheLatestNotificationLookupCanPublishNavigation() {
        assertTrue(isLatestNotificationTargetRequest(3, 3, sessionCurrent = true))
        assertFalse(isLatestNotificationTargetRequest(2, 3, sessionCurrent = true))
        assertFalse(isLatestNotificationTargetRequest(3, 3, sessionCurrent = false))
    }

    @Test
    fun everyProductInADeliveredMultiItemOrderCanOpenItsOwnReviewForm() {
        val first = orderItem(id = 201)
        val second = orderItem(id = 204)
        val order = order(status = "DELIVERED", items = listOf(first, second))

        assertTrue(first.canOpenReviewFor(order))
        assertTrue(second.canOpenReviewFor(order))
        assertFalse(first.canOpenReviewFor(order.copy(status = "SHIPPED", displayStatusText = "Kargoda")))
        assertFalse(orderItem(id = null).canOpenReviewFor(order))
    }

    private fun orderItem(id: Int?) = AccountOrderItem(
        id = id,
        productId = id,
        name = "Ürün",
        image = null,
        price = 10.0,
        quantity = 1,
        oldPrice = null,
        lineTotal = 10.0
    )

    private fun order(status: String, items: List<AccountOrderItem>) = AccountOrder(
        id = 1,
        userId = 7001,
        totalAmount = "20.00",
        status = status,
        createdAt = "2026-08-14T00:00:00Z",
        customerName = "Nova Müşteri",
        email = "customer@example.invalid",
        phone = null,
        address = null,
        items = items,
        paymentStatus = "paid",
        paymentRef = null,
        displayStatusText = if (status == "DELIVERED") "Teslim Edildi" else status,
        statusNote = null,
        isPendingPayment = false,
        isPaymentFailed = false,
        shipmentProvider = null,
        trackingNo = null,
        shipmentStatus = null,
        cancelReason = null,
        refundStatus = null,
        estimatedDeliveryDate = null,
        paymentMethod = null,
        currency = "TRY",
        trackingUrl = null,
        etaDate = null
    )
}
