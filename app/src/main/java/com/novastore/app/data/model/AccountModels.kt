package com.novastore.app.data.model

import com.google.gson.annotations.SerializedName

data class AccountOrder(
    val id: Int,
    @SerializedName("user_id") val userId: Int?,
    @SerializedName("total_amount") val totalAmount: String?,
    val status: String?,
    @SerializedName("created_at") val createdAt: String?,
    @SerializedName("customer_name") val customerName: String?,
    val email: String?,
    val phone: String?,
    val address: String?,
    val items: List<AccountOrderItem>?,
    @SerializedName("payment_status") val paymentStatus: String?,
    @SerializedName("payment_ref") val paymentRef: String?,
    @SerializedName("display_status") val displayStatusText: String?,
    @SerializedName("status_note") val statusNote: String?,
    @SerializedName("is_pending_payment") val isPendingPayment: Boolean?,
    @SerializedName("is_payment_failed") val isPaymentFailed: Boolean?,
    @SerializedName("shipment_provider") val shipmentProvider: String?,
    @SerializedName("tracking_no") val trackingNo: String?,
    @SerializedName("shipment_status") val shipmentStatus: String?,
    @SerializedName("cancel_reason") val cancelReason: String?,
    @SerializedName("refund_status") val refundStatus: String?,
    @SerializedName("estimated_delivery_date") val estimatedDeliveryDate: String?,
    @SerializedName("payment_method") val paymentMethod: String?,
    val currency: String?,
    @SerializedName("tracking_url") val trackingUrl: String?,
    @SerializedName("eta_date") val etaDate: String?
)

data class AccountOrderItem(
    val id: Int?,
    val name: String?,
    val image: String?,
    val price: Double?,
    val quantity: Int?,
    @SerializedName("old_price") val oldPrice: Double?,
    @SerializedName("line_total") val lineTotal: Double?
)

data class AccountCoupon(
    val id: Int,
    val code: String,
    @SerializedName("discount_type") val discountType: String?,
    @SerializedName("discount_value") val discountValue: Double?,
    @SerializedName("min_order_amount") val minOrderAmount: Double?,
    @SerializedName("max_discount_amount") val maxDiscountAmount: Double?,
    @SerializedName("starts_at") val startsAt: String?,
    @SerializedName("ends_at") val endsAt: String?
)

data class AccountMessage(
    val id: Int,
    @SerializedName("sender_id") val senderId: Int?,
    @SerializedName("receiver_id") val receiverId: Int?,
    val message: String,
    @SerializedName("created_at") val createdAt: String?,
    @SerializedName("is_ai_handoff") val isAiHandoff: Boolean?
)

data class SendMessageRequest(
    @SerializedName("receiver_id") val receiverId: Int? = null,
    val message: String
)

data class UpdateProfileRequest(
    val fullName: String,
    val phone: String?
)

data class UpdateProfileResponse(
    val mesaj: String?,
    val user: UserInfo
)

data class ReturnRequestBody(
    @SerializedName("order_id") val orderId: Int,
    @SerializedName("reason_code") val reasonCode: String,
    val note: String?
)

data class CancelOrderRequestBody(
    @SerializedName("reason_code") val reasonCode: String,
    val note: String? = null
)

data class BasicMessageResponse(
    val mesaj: String?,
    val error: String?,
    val message: String? = null
)

data class SecurityStatus(
    val email: String?,
    val emailVerified: Boolean = false,
    val phone: String?,
    val phoneVerified: Boolean = false,
    val twoFactorEnabled: Boolean = false,
    val hasPassword: Boolean = true
)

data class ChangePasswordRequest(
    val currentPassword: String,
    val newPassword: String
)

data class ForgotPasswordRequest(
    val email: String
)

data class PhoneCodeRequest(
    val phone: String? = null,
    val code: String? = null
)

data class UserReview(
    val id: Int,
    @SerializedName("product_id") val productId: Int?,
    val rating: Int?,
    val comment: String?,
    @SerializedName("created_at") val createdAt: String?,
    @SerializedName("product_name") val productName: String?
)
