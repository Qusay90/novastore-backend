package com.novastore.app.data.repository

import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.data.model.PaymentRequest
import com.novastore.app.data.model.PaymentResponse
import com.novastore.app.data.model.PaymentStatusResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PaymentRepository @Inject constructor(
    private val api: NovaStoreApi
) {
    suspend fun initializePayment(request: PaymentRequest, sessionGeneration: Long): Result<PaymentResponse> = runCatching {
        api.initializePayment(sessionGeneration = sessionGeneration, body = request)
    }

    suspend fun getPaymentStatus(
        paymentRef: String,
        orderId: Int,
        sessionGeneration: Long
    ): Result<PaymentStatusResponse> = runCatching {
        api.getPaymentStatus(
            sessionGeneration = sessionGeneration,
            paymentRef = paymentRef,
            orderId = orderId
        )
    }
}
