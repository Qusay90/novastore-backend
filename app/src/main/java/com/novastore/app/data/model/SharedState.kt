package com.novastore.app.data.model

import kotlinx.serialization.Serializable

@Serializable
data class SharedCartPayload(
    val version: Int = 1,
    val items: List<CartItem> = emptyList(),
    val updatedAt: String? = null
)

@Serializable
data class SharedCartStateResponse(
    val key: String,
    val exists: Boolean = false,
    val payload: SharedCartPayload,
    val updatedAt: String? = null
)

@Serializable
data class SharedCartStateRequest(
    val payload: SharedCartPayload
)

@Serializable
data class SharedCheckoutPayload(
    val version: Int = 1,
    val items: List<CartItem> = emptyList(),
    val selectedAddressId: Long? = null,
    val couponCode: String? = null,
    val paymentMethod: String? = null,
    val updatedAt: String? = null
)

@Serializable
data class SharedCheckoutStateResponse(
    val key: String,
    val exists: Boolean = false,
    val payload: SharedCheckoutPayload,
    val updatedAt: String? = null
)

@Serializable
data class SharedCheckoutStateRequest(
    val payload: SharedCheckoutPayload
)
