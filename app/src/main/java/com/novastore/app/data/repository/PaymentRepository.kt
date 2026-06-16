package com.novastore.app.data.repository

import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.data.model.PaymentRequest
import com.novastore.app.data.model.PaymentResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PaymentRepository @Inject constructor(
    private val api: NovaStoreApi
) {
    suspend fun initializePayment(request: PaymentRequest): Result<PaymentResponse> = runCatching {
        api.initializePayment(request)
    }
}
