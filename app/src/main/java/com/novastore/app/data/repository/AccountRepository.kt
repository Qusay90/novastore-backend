package com.novastore.app.data.repository

import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.data.model.ChangePasswordRequest
import com.novastore.app.data.model.ForgotPasswordRequest
import com.novastore.app.data.model.PhoneCodeRequest
import com.novastore.app.data.model.ReturnRequestBody
import com.novastore.app.data.model.SendMessageRequest
import com.novastore.app.data.model.UpdateProfileRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AccountRepository @Inject constructor(
    private val api: NovaStoreApi
) {
    suspend fun getOrders(userId: Int) = runCatching {
        api.getUserOrders(userId)
    }

    suspend fun cancelOrder(orderId: Int) = runCatching {
        api.cancelOrder(orderId)
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

    suspend fun forgotPassword(email: String) = runCatching {
        api.forgotPassword(ForgotPasswordRequest(email))
    }

    suspend fun sendPhoneCode(phone: String?) = runCatching {
        api.sendPhoneCode(PhoneCodeRequest(phone = phone))
    }

    suspend fun verifyPhoneCode(phone: String?, code: String) = runCatching {
        api.verifyPhoneCode(PhoneCodeRequest(phone = phone, code = code))
    }

    suspend fun sendEmailVerification() = runCatching {
        api.sendEmailVerification()
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
