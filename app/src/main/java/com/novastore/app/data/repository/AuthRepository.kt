package com.novastore.app.data.repository

import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.core.session.SessionManager
import com.novastore.app.data.model.*
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: NovaStoreApi,
    private val sessionManager: SessionManager
) {
    val isLoggedIn: Boolean
        get() = sessionManager.isLoggedIn

    val isLoggedInFlow: StateFlow<Boolean>
        get() = sessionManager.isLoggedInFlow

    val currentUserEmail: String?
        get() = sessionManager.email

    val currentUserId: Int
        get() = sessionManager.userId

    val currentUserName: String?
        get() = sessionManager.fullName

    val currentUserPhone: String?
        get() = sessionManager.phone

    suspend fun login(email: String, password: String): Result<LoginResponse> = runCatching {
        val response = api.login(LoginRequest(email, password))
        sessionManager.saveSession(
            token = response.token,
            userId = response.user.id,
            fullName = response.user.fullName,
            email = response.user.email,
            phone = response.user.phone
        )
        refreshUserProfile().getOrNull()
        response
    }

    suspend fun refreshUserProfile(): Result<UserInfo> = runCatching {
        val response = api.getCurrentUserProfile()
        sessionManager.updateProfile(response.user.fullName, response.user.phone)
        response.user
    }

    suspend fun register(fullName: String, email: String, password: String): Result<RegisterResponse> = runCatching {
        api.register(RegisterRequest(fullName, email, password))
    }

    suspend fun forgotPassword(email: String): Result<BasicMessageResponse> = runCatching {
        api.forgotPassword(ForgotPasswordRequest(email))
    }

    fun logout() {
        sessionManager.clearSession()
    }

    fun updateCachedProfile(fullName: String, phone: String?) {
        sessionManager.updateProfile(fullName, phone)
    }
}
