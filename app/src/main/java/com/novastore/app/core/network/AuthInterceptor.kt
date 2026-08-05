package com.novastore.app.core.network

import com.novastore.app.core.session.SessionManager
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val sessionManager: SessionManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val sessionSnapshot = sessionManager.captureSession()
        val token = sessionSnapshot?.token

        val request = if (!token.isNullOrEmpty()) {
            originalRequest.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            originalRequest
        }

        val response = chain.proceed(request)
        if (response.code == 401 && sessionSnapshot != null) {
            sessionManager.clearSessionIfCurrent(sessionSnapshot)
        }

        return response
    }
}
