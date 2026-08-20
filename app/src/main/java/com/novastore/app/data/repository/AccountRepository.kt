package com.novastore.app.data.repository

import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.data.model.CancelOrderRequestBody
import com.novastore.app.data.model.ChangePasswordRequest
import com.novastore.app.data.model.CustomerVerificationCode
import com.novastore.app.data.model.PasswordResetCodeRequest
import com.novastore.app.data.model.PasswordResetCodeVerificationRequest
import com.novastore.app.data.model.PasswordResetCompletionRequest
import com.novastore.app.data.model.PhoneVerificationSendRequest
import com.novastore.app.data.model.ReturnRequestBody
import com.novastore.app.data.model.SendMessageRequest
import com.novastore.app.data.model.SubmitReviewRequest
import com.novastore.app.data.model.UpdateProfileRequest
import com.novastore.app.data.model.VerificationCodeRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AccountRepository @Inject constructor(
    private val api: NovaStoreApi
) {
    suspend fun getOrders(userId: Int) = runCatching {
        api.getUserOrders(userId)
    }

    suspend fun cancelOrder(
        orderId: Int,
        reasonCode: String = "CUSTOMER_REQUEST",
        note: String? = null,
        sessionGeneration: Long
    ) = runCatching {
        api.cancelOrder(
            orderId = orderId,
            sessionGeneration = sessionGeneration,
            body = CancelOrderRequestBody(reasonCode = reasonCode, note = note)
        )
    }

    suspend fun getCoupons() = runCatching {
        api.getActiveCoupons()
    }

    suspend fun getMessages(userId: Int) = runCatching {
        api.getChatHistory(userId)
    }

    suspend fun sendMessage(message: String, sessionGeneration: Long) = runCatching {
        api.sendSupportMessage(
            sessionGeneration = sessionGeneration,
            body = SendMessageRequest(message = message)
        )
    }

    suspend fun updateProfile(fullName: String, phone: String?, sessionGeneration: Long) = runCatching {
        api.updateProfile(
            sessionGeneration = sessionGeneration,
            body = UpdateProfileRequest(fullName = fullName, phone = phone)
        )
    }

    suspend fun getSecurityStatus() = runCatching {
        api.getSecurityStatus()
    }

    suspend fun changePassword(currentPassword: String, newPassword: String, sessionGeneration: Long) = runCatching {
        api.changePassword(
            sessionGeneration = sessionGeneration,
            body = ChangePasswordRequest(currentPassword, newPassword)
        )
    }

    suspend fun forgotPassword(identifier: String) = runCatching {
        api.requestPasswordReset(PasswordResetCodeRequest(identifier.trim()))
    }

    suspend fun sendPhoneCode(phone: String?, sessionGeneration: Long) = runCatching {
        api.sendPhoneCode(
            sessionGeneration = sessionGeneration,
            body = PhoneVerificationSendRequest(phone = phone)
        )
    }

    suspend fun verifyPhoneCode(code: String, sessionGeneration: Long) = runCatching {
        require(CustomerVerificationCode.isValid(code))
        api.verifyPhoneCode(
            sessionGeneration = sessionGeneration,
            body = VerificationCodeRequest(code)
        )
    }

    suspend fun sendEmailVerification(sessionGeneration: Long) = runCatching {
        api.sendEmailVerification(sessionGeneration = sessionGeneration)
    }

    suspend fun verifyEmailCode(code: String, sessionGeneration: Long) = runCatching {
        require(CustomerVerificationCode.isValid(code))
        api.verifyEmailCode(
            sessionGeneration = sessionGeneration,
            body = VerificationCodeRequest(code)
        )
    }

    suspend fun verifyPasswordResetCode(identifier: String, code: String) = runCatching {
        require(CustomerVerificationCode.isValid(code))
        api.verifyPasswordResetCode(
            PasswordResetCodeVerificationRequest(identifier.trim(), code)
        )
    }

    suspend fun completePasswordReset(
        identifier: String,
        code: String,
        newPassword: String,
        logoutAll: Boolean? = null
    ) = runCatching {
        require(CustomerVerificationCode.isValid(code))
        api.completePasswordReset(
            PasswordResetCompletionRequest(
                identifier = identifier.trim(),
                code = code,
                newPassword = newPassword,
                logoutAll = logoutAll
            )
        )
    }

    suspend fun setupTwoFactor() = runCatching {
        api.setupTwoFactor()
    }

    suspend fun requestReturn(orderId: Int, note: String?, sessionGeneration: Long) = runCatching {
        api.createReturnRequest(
            sessionGeneration = sessionGeneration,
            body = ReturnRequestBody(
                orderId = orderId,
                reasonCode = "CUSTOMER_REQUEST",
                note = note
            )
        )
    }

    suspend fun getReturnRequest(returnId: Long) = runCatching {
        api.getReturnRequest(returnId)
    }

    suspend fun getReviews(userId: Int) = runCatching {
        api.getUserReviews(userId)
    }

    suspend fun getReviewPermission(productId: Int) = runCatching {
        api.getProductReviews(productId).reviewPermission
    }

    suspend fun submitReview(productId: Int, rating: Int, comment: String?, sessionGeneration: Long) = runCatching {
        require(productId > 0)
        require(rating in 1..5)
        require(comment == null || comment.length <= 2000)
        api.submitReview(
            sessionGeneration = sessionGeneration,
            body = SubmitReviewRequest(
                productId = productId,
                rating = rating,
                comment = comment?.trim()?.ifBlank { null }
            )
        )
    }

    suspend fun getProductQuestions() = runCatching {
        api.getUserProductQuestions()
    }
}
