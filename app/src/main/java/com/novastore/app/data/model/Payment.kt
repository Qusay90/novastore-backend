package com.novastore.app.data.model

import com.google.gson.annotations.SerializedName
import kotlinx.serialization.Serializable

@Serializable
data class PaymentRequest(
    val fullName: String,
    val email: String,
    val phone: String,
    val address: String,
    val cartItems: List<CartItemForPayment>,
    val couponCode: String? = null,
    val paymentMethod: String = "card"
)

@Serializable
data class CartItemForPayment(
    @SerializedName("id")
    val productId: Int,
    val name: String,
    val price: Double,
    @SerializedName("image")
    val imageUrl: String?,
    val quantity: Int
)

@Serializable
data class PaymentResponse(
    val orderId: Int,
    val paymentRef: String?,
    val paymentStatus: String,
    val provider: String,
    val idempotencyKey: String,
    val totals: PaymentTotals?,
    val paymentAction: PaymentAction?,
    val message: String
)

@Serializable
data class PaymentTotals(
    val subtotal: Double,
    val total: Double,
    val currency: String
)

@Serializable
data class PaymentAction(
    val provider: String?,
    val status: String?,
    val action: PaymentActionRedirect?
)

@Serializable
data class PaymentActionRedirect(
    val type: String?,
    val successUrl: String?,
    val failUrl: String?,
    val message: String?
)
