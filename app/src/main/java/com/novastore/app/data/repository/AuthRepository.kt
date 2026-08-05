package com.novastore.app.data.repository

import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.core.session.CurrentUserFetchResult
import com.novastore.app.core.session.CurrentUserFetcher
import com.novastore.app.core.session.SessionBootstrapState
import com.novastore.app.core.session.SessionGenerationSnapshot
import com.novastore.app.core.session.SessionLifecycleCoordinator
import com.novastore.app.core.session.SessionManager
import com.novastore.app.core.session.SessionRevoker
import com.novastore.app.data.model.BasicMessageResponse
import com.novastore.app.data.model.CustomerVerificationCode
import com.novastore.app.data.model.LoginRequest
import com.novastore.app.data.model.LoginResponse
import com.novastore.app.data.model.PasswordResetCodeRequest
import com.novastore.app.data.model.PasswordResetCodeVerificationRequest
import com.novastore.app.data.model.PasswordResetCodeVerificationResponse
import com.novastore.app.data.model.PasswordResetCompletionRequest
import com.novastore.app.data.model.RegisterRequest
import com.novastore.app.data.model.RegisterResponse
import com.novastore.app.data.model.UserInfo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import retrofit2.HttpException
import javax.inject.Inject
import javax.inject.Singleton

data class LogoutResult(
    val serverRevocationVerified: Boolean,
    val initiatingSessionCleared: Boolean,
    val warning: String? = null
)

@Singleton
class AuthRepository @Inject constructor(
    private val api: NovaStoreApi,
    private val sessionManager: SessionManager
) {
    private val lifecycleCoordinator = SessionLifecycleCoordinator(
        persistence = sessionManager,
        currentUserFetcher = CurrentUserFetcher {
            try {
                CurrentUserFetchResult.Success(api.getCurrentUserProfile().user)
            } catch (error: HttpException) {
                if (error.code() == 401) {
                    CurrentUserFetchResult.Unauthorized
                } else {
                    CurrentUserFetchResult.TemporaryFailure
                }
            } catch (_: Exception) {
                CurrentUserFetchResult.TemporaryFailure
            }
        },
        sessionRevoker = SessionRevoker {
            api.logout().code() == 204
        }
    )

    private val _sessionBootstrapState =
        MutableStateFlow<SessionBootstrapState>(SessionBootstrapState.Unknown)
    val sessionBootstrapState: StateFlow<SessionBootstrapState> =
        _sessionBootstrapState.asStateFlow()

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

    suspend fun bootstrapSession(): SessionBootstrapState {
        _sessionBootstrapState.value = SessionBootstrapState.Unknown
        return lifecycleCoordinator.bootstrap().also {
            _sessionBootstrapState.value = it
        }
    }

    suspend fun login(identifier: String, password: String): Result<LoginResponse> = runCatching {
        val response = api.login(LoginRequest(identifier.trim(), password))
        sessionManager.saveSession(
            token = response.token,
            userId = response.user.id,
            fullName = response.user.fullName,
            email = response.user.email,
            phone = response.user.phone,
            role = response.user.role,
            emailVerified = response.user.emailVerified,
            phoneVerified = response.user.phoneVerified
        )
        lifecycleCoordinator.markAuthenticated(response.user)
        _sessionBootstrapState.value = SessionBootstrapState.Authenticated(response.user)
        response
    }

    suspend fun refreshUserProfile(): Result<UserInfo> = runCatching {
        val sessionSnapshot = sessionManager.captureSession()
            ?: throw IllegalStateException("Authenticated session required.")
        val response = api.getCurrentUserProfile()
        sessionManager.authenticateIfCurrent(sessionSnapshot, response.user)
        response.user
    }

    suspend fun register(
        fullName: String,
        email: String,
        password: String,
        phone: String? = null
    ): Result<RegisterResponse> = runCatching {
        api.register(RegisterRequest(fullName, email, password, phone))
    }

    suspend fun forgotPassword(identifier: String): Result<BasicMessageResponse> = runCatching {
        api.requestPasswordReset(PasswordResetCodeRequest(identifier.trim()))
    }

    suspend fun verifyPasswordResetCode(
        identifier: String,
        code: String
    ): Result<PasswordResetCodeVerificationResponse> = runCatching {
        require(CustomerVerificationCode.isValid(code)) {
            "Doğrulama kodu 6 haneli olmalıdır."
        }
        api.verifyPasswordResetCode(
            PasswordResetCodeVerificationRequest(identifier.trim(), code)
        )
    }

    suspend fun completePasswordReset(
        identifier: String,
        code: String,
        newPassword: String,
        logoutAll: Boolean? = null
    ): Result<BasicMessageResponse> = runCatching {
        require(CustomerVerificationCode.isValid(code)) {
            "Doğrulama kodu 6 haneli olmalıdır."
        }
        api.completePasswordReset(
            PasswordResetCompletionRequest(
                identifier = identifier.trim(),
                code = code,
                newPassword = newPassword,
                logoutAll = logoutAll
            )
        )
    }

    suspend fun logout(): LogoutResult {
        val outcome = lifecycleCoordinator.logout()
        if (outcome.initiatingSessionCleared) {
            _sessionBootstrapState.value = SessionBootstrapState.Guest
        } else {
            _sessionBootstrapState.value = lifecycleCoordinator.state
        }
        return LogoutResult(
            serverRevocationVerified = outcome.serverRevocationVerified,
            initiatingSessionCleared = outcome.initiatingSessionCleared,
            warning = if (
                outcome.initiatingSessionCleared
                && !outcome.serverRevocationVerified
            ) {
                "Bu cihazdaki oturum kapatıldı; sunucu oturumunun kapatıldığı doğrulanamadı."
            } else {
                null
            }
        )
    }

    fun captureSession(): SessionGenerationSnapshot? =
        sessionManager.captureSession()

    fun isSessionCurrent(snapshot: SessionGenerationSnapshot): Boolean =
        sessionManager.isCurrent(snapshot)

    fun updateCachedProfileIfCurrent(
        snapshot: SessionGenerationSnapshot,
        fullName: String,
        phone: String?
    ): Boolean =
        sessionManager.updateProfileIfCurrent(snapshot, fullName, phone)
}
