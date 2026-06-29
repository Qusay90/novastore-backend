package com.novastore.app.feature.checkout

import com.google.gson.Gson
import com.novastore.app.data.model.CartItem
import com.novastore.app.feature.product.nextSelectedCouponCode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CouponCheckoutFlowTest {

    private val cartItem = CartItem(
        productId = 101,
        name = "Test Product",
        price = 250.0,
        imageUrl = null,
        quantity = 2
    )

    @Test
    fun selectedCouponIsCarriedIntoPaymentRequest() {
        val request = paymentRequest(couponCode = " LIVE50 ")

        assertEquals("LIVE50", request.couponCode)
        assertTrue(Gson().toJson(request).contains("\"couponCode\":\"LIVE50\""))
    }

    @Test
    fun nullOrBlankCouponKeepsPaymentRequestWithoutCoupon() {
        val nullCouponRequest = paymentRequest(couponCode = null)
        val blankCouponRequest = paymentRequest(couponCode = "   ")

        assertNull(nullCouponRequest.couponCode)
        assertNull(blankCouponRequest.couponCode)
        assertFalse(Gson().toJson(nullCouponRequest).contains("\"couponCode\""))
        assertFalse(Gson().toJson(blankCouponRequest).contains("\"couponCode\""))
    }

    @Test
    fun selectingSameCouponAgainClearsSelection() {
        assertEquals("LIVE50", nextSelectedCouponCode(null, " LIVE50 "))
        assertNull(nextSelectedCouponCode("LIVE50", "LIVE50"))
        assertNull(nextSelectedCouponCode("LIVE50", "   "))
        assertNull(nextSelectedCouponCode(null, null))
    }

    private fun paymentRequest(couponCode: String?) = buildPaymentRequest(
        fullName = "Test User",
        email = "test@example.com",
        phone = "05555555555",
        address = "Test Address",
        cartItems = listOf(cartItem),
        couponCode = couponCode,
        paymentMethod = "card"
    )
}
