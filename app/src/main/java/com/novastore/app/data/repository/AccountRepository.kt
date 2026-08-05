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
        note: String? = null
    ) = runCatching {
        api.cancelOrder(
            orderId,
            CancelOrderRequestBody(reasonCode = reasonCode, note = note)
        )
    }

    suspend fun getCoupons() = runCatching {
        api.getActiveCoupons()
    }

    suspend fun getMessages(userId: Int) = runCatching {
        api.getChatHistory(userId)
    }

    suspend fun sendMessage(message: String) = runCatching {
        api.sendSupportMessage(SendMessageRequest(message = message))
    }

    suspend fun updateProfile(fullName: String, phone: String?) = runCatching {
        api.updateProfile(UpdateProfileRequest(fullName = fullName, phone = phone))
    }

    suspend fun getSecurityStatus() = runCatching {
        api.getSecurityStatus()
    }

    suspend fun changePassword(currentPassword: String, newPassword: String) = runCatching {
        api.changePassword(ChangePasswordRequest(currentPassword, newPassword))
    }

    suspend fun forgotPassword(identifier: String) = runCatching {
        api.requestPasswordReset(PasswordResetCodeRequest(identifier.trim()))
    }

    suspend fun sendPhoneCode(phone: String?) = runCatching {
        api.sendPhoneCode(PhoneVerificationSendRequest(phone = phone))
    }

    suspend fun verifyPhoneCode(code: String) = runCatching {
        require(CustomerVerificationCode.isValid(code))
        api.verifyPhoneCode(VerificationCodeRequest(code))
    }

    suspend fun sendEmailVerification() = runCatching {
        api.sendEmailVerification()
    }

    suspend fun verifyEmailCode(code: String) = runCatching {
        require(CustomerVerificationCode.isValid(code))
        api.verifyEmailCode(VerificationCodeRequest(code))
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

    suspend fun requestReturn(orderId: Int, note: String?) = runCatching {
        api.createReturnRequest(
            ReturnRequestBody(
                orderId = orderId,
                reasonCode = "CUSTOMER_REQUEST",
                note = note
            )
        )
    }

    suspend fun getReviews(userId: Int) = runCatching {
        api.getUserReviews(userId)
    }

    suspend fun getProductQuestions() = runCatching {
        api.getUserProductQuestions()
    }
}
