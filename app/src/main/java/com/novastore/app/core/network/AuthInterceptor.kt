package com.novastore.app.core.network

import com.novastore.app.core.session.SessionManager
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

internal fun isSessionGenerationBindingValid(boundGeneration: Long?, currentGeneration: Long): Boolean =
    boundGeneration == null || boundGeneration == currentGeneration

@Singleton
class AuthInterceptor @Inject constructor(
    private val sessionManager: SessionManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val boundGeneration = originalRequest.header(SESSION_GENERATION_HEADER)?.toLongOrNull()
        val sessionSnapshot = sessionManager.captureSession()
        val capturedGeneration = sessionSnapshot?.generation ?: sessionManager.generation
        if (!isSessionGenerationBindingValid(boundGeneration, capturedGeneration)) {
            throw IOException("Customer session changed before request dispatch.")
        }
        val existingAuthorization = originalRequest.header("Authorization")
        val token = sessionSnapshot?.token

        val requestBuilder = originalRequest.newBuilder().removeHeader(SESSION_GENERATION_HEADER)
        val request = if (existingAuthorization == null && !token.isNullOrEmpty()) {
            requestBuilder
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            requestBuilder.build()
        }

        val response = chain.proceed(request)
        val requestBelongsToCurrentSession = existingAuthorization == null ||
            existingAuthorization == sessionSnapshot?.let { "Bearer ${it.token}" }
        if (response.code == 401 && sessionSnapshot != null && requestBelongsToCurrentSession) {
            sessionManager.clearSessionIfCurrent(sessionSnapshot)
        }

        return response
    }

    private companion object {
        const val SESSION_GENERATION_HEADER = "X-NovaStore-Session-Generation"
    }
}
