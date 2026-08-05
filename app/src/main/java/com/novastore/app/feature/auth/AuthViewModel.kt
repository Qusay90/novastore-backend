package com.novastore.app.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.novastore.app.core.session.SessionBootstrapState
import com.novastore.app.core.session.isAuthenticatedForUi
import com.novastore.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException
import timber.log.Timber
import java.io.IOException
import javax.inject.Inject

enum class PasswordResetStep {
    IDENTIFIER,
    CODE,
    NEW_PASSWORD
}

data class AuthUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val isSuccess: Boolean = false,
    val resetLoading: Boolean = false,
    val resetMessage: String? = null,
    val resetStep: PasswordResetStep = PasswordResetStep.IDENTIFIER,
    val resetComplete: Boolean = false
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    private val _isLoggedInState = MutableStateFlow(false)
    val isLoggedInState: StateFlow<Boolean> = _isLoggedInState.asStateFlow()
    val sessionState: StateFlow<SessionBootstrapState> = authRepository.sessionBootstrapState

    private var logoutInProgress = false

    val isLoggedIn: Boolean
        get() = authRepository.isLoggedIn

    val currentUserEmail: String?
        get() = authRepository.currentUserEmail

    val currentUserName: String?
        get() = authRepository.currentUserName

    val currentUserId: Int
        get() = authRepository.currentUserId

    init {
        viewModelScope.launch {
            val bootstrapState = authRepository.bootstrapSession()
            _isLoggedInState.value = bootstrapState.isAuthenticatedForUi

            authRepository.isLoggedInFlow.drop(1).collect { loggedIn ->
                _isLoggedInState.value = loggedIn
                if (!loggedIn) {
                    _uiState.update { it.copy(isLoading = false, isSuccess = false) }
                }
            }
        }
    }

    fun login(identifier: String, password: String) {
        if (identifier.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(error = "E-posta ve şifre alanları boş bırakılamaz.") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val result = authRepository.login(identifier, password)
            if (result.isSuccess) {
                Timber.d("Login successful.")
                _isLoggedInState.value = true
                _uiState.update { it.copy(isLoading = false, isSuccess = true) }
            } else {
                val errorMsg = result.exceptionOrNull().toLoginMessage()
                Timber.e("Error during login: $errorMsg")
                _uiState.update { it.copy(isLoading = false, error = errorMsg) }
            }
        }
    }

    fun register(fullName: String, email: String, password: String, phone: String? = null) {
        if (fullName.isBlank() || email.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(error = "Lütfen tüm alanları doldurun.") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val result = authRepository.register(fullName, email, password, phone)
            if (result.isSuccess) {
                Timber.d("Registration successful; attempting automatic login.")
                // Auto-login after registration
                val loginResult = authRepository.login(email, password)
                if (loginResult.isSuccess) {
                    _isLoggedInState.value = true
                    _uiState.update { it.copy(isLoading = false, isSuccess = true) }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "Hesap oluşturuldu fakat giriş yapılamadı. Lütfen giriş yapmayı deneyin.") }
                }
            } else {
                val errorMsg = result.exceptionOrNull().toRegisterMessage()
                Timber.e("Error during registration: $errorMsg")
                _uiState.update { it.copy(isLoading = false, error = errorMsg) }
            }
        }
    }

    fun logout() {
        if (logoutInProgress) return
        logoutInProgress = true
        viewModelScope.launch {
            try {
                val result = authRepository.logout()
                if (result.serverRevocationVerified) Timber.d("Server session revocation verified.")
                if (result.initiatingSessionCleared) {
                    _isLoggedInState.value = false
                    _uiState.update { it.copy(isSuccess = false, error = result.warning) }
                }
            } finally {
                logoutInProgress = false
            }
        }
    }

    fun resetSuccess() {
        _uiState.update { it.copy(isSuccess = false) }
    }

    fun sendPasswordReset(identifier: String) {
        if (identifier.isBlank()) {
            _uiState.update {
                it.copy(resetMessage = "6 haneli şifre sıfırlama kodu için e-posta veya telefonunu yaz.")
            }
            return
        }

        _uiState.update { it.copy(resetLoading = true, resetMessage = null, error = null) }
        viewModelScope.launch {
            val result = authRepository.forgotPassword(identifier)
            _uiState.update {
                it.copy(
                    resetLoading = false,
                    resetMessage = if (result.isSuccess) {
                        result.getOrNull()?.message
                            ?: "Eğer bu e-posta veya telefon sistemde kayıtlıysa 6 haneli şifre sıfırlama kodu gönderildi."
                    } else {
                        result.exceptionOrNull().toResetMessage()
                    },
                    resetStep = if (result.isSuccess) PasswordResetStep.CODE else it.resetStep
                )
            }
        }
    }

    fun verifyPasswordResetCode(identifier: String, code: String) {
        if (identifier.isBlank() || !Regex("^\\d{6}$").matches(code)) {
            _uiState.update { it.copy(resetMessage = "6 haneli doğrulama kodunu eksiksiz gir.") }
            return
        }

        _uiState.update { it.copy(resetLoading = true, resetMessage = null, error = null) }
        viewModelScope.launch {
            val result = authRepository.verifyPasswordResetCode(identifier, code)
            val response = result.getOrNull()
            _uiState.update {
                it.copy(
                    resetLoading = false,
                    resetMessage = when {
                        result.isFailure -> result.exceptionOrNull().toResetMessage()
                        response?.valid == true -> response.message ?: "Kod doğrulandı. Yeni şifreni belirleyebilirsin."
                        else -> response?.message ?: "Kod geçersiz veya süresi dolmuş."
                    },
                    resetStep = if (response?.valid == true) PasswordResetStep.NEW_PASSWORD else it.resetStep
                )
            }
        }
    }

    fun completePasswordReset(
        identifier: String,
        code: String,
        newPassword: String
    ) {
        if (newPassword.length < 8) {
            _uiState.update { it.copy(resetMessage = "Yeni şifre en az 8 karakter olmalıdır.") }
            return
        }

        _uiState.update { it.copy(resetLoading = true, resetMessage = null, error = null) }
        viewModelScope.launch {
            val result = authRepository.completePasswordReset(
                identifier = identifier,
                code = code,
                newPassword = newPassword,
                logoutAll = true
            )
            _uiState.update {
                it.copy(
                    resetLoading = false,
                    resetComplete = result.isSuccess,
                    resetMessage = if (result.isSuccess) {
                        result.getOrNull()?.message ?: "Şifren güncellendi. Yeni şifrenle giriş yapabilirsin."
                    } else {
                        result.exceptionOrNull().toResetMessage()
                    }
                )
            }
        }
    }

    fun restartPasswordReset() {
        _uiState.update {
            it.copy(
                resetLoading = false,
                resetMessage = null,
                resetStep = PasswordResetStep.IDENTIFIER,
                resetComplete = false
            )
        }
    }

    fun clearMessages() {
        _uiState.update { it.copy(error = null, resetMessage = null) }
    }

    private fun Throwable?.toLoginMessage(): String {
        return when (this) {
            is HttpException -> when (code()) {
                400, 401, 403, 404 -> "E-posta veya şifre hatalı."
                else -> "Giriş yapılamadı. Lütfen tekrar dene."
            }
            is IOException -> "İnternet bağlantını kontrol edip tekrar dene."
            else -> "Giriş başarısız. E-posta veya şifre hatalı."
        }
    }

    private fun Throwable?.toRegisterMessage(): String {
        return when (this) {
            is HttpException -> when (code()) {
                400, 409 -> "Bu e-posta kullanılıyor olabilir veya bilgiler geçersiz."
                else -> "Hesap oluşturulurken bir hata oluştu."
            }
            is IOException -> "İnternet bağlantını kontrol edip tekrar dene."
            else -> "Hesap oluşturulurken bir hata meydana geldi."
        }
    }

    private fun Throwable?.toResetMessage(): String {
        return when (this) {
            is HttpException -> "Şifre sıfırlama kodu gönderilemedi. Lütfen tekrar dene."
            is IOException -> "İnternet bağlantını kontrol edip tekrar dene."
            else -> "Şifre sıfırlama kodu gönderilemedi. Lütfen tekrar dene."
        }
    }
}
