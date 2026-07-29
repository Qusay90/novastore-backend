package com.novastore.app.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.novastore.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException
import timber.log.Timber
import java.io.IOException
import javax.inject.Inject

data class AuthUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val isSuccess: Boolean = false,
    val resetLoading: Boolean = false,
    val resetMessage: String? = null
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    private val _isLoggedInState = MutableStateFlow(authRepository.isLoggedIn)
    val isLoggedInState: StateFlow<Boolean> = _isLoggedInState.asStateFlow()

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
            authRepository.isLoggedInFlow.collect { loggedIn ->
                _isLoggedInState.value = loggedIn
                if (!loggedIn) {
                    _uiState.update { it.copy(isLoading = false, isSuccess = false) }
                }
            }
        }
    }

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(error = "E-posta ve şifre alanları boş bırakılamaz.") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val result = authRepository.login(email, password)
            if (result.isSuccess) {
                Timber.d("Login successful: email=$email")
                _isLoggedInState.value = true
                _uiState.update { it.copy(isLoading = false, isSuccess = true) }
            } else {
                val errorMsg = result.exceptionOrNull().toLoginMessage()
                Timber.e("Error during login: $errorMsg")
                _uiState.update { it.copy(isLoading = false, error = errorMsg) }
            }
        }
    }

    fun register(fullName: String, email: String, password: String) {
        if (fullName.isBlank() || email.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(error = "Lütfen tüm alanları doldurun.") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val result = authRepository.register(fullName, email, password)
            if (result.isSuccess) {
                Timber.d("Registration successful, now logging in: email=$email")
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
        viewModelScope.launch {
            val result = authRepository.logout()
            if (result.serverRevocationVerified) Timber.d("Server session revocation verified.")
            _isLoggedInState.value = false
            _uiState.update { it.copy(isSuccess = false, error = result.warning) }
        }
    }

    fun resetSuccess() {
        _uiState.update { it.copy(isSuccess = false) }
    }

    fun sendPasswordReset(email: String) {
        if (email.isBlank()) {
            _uiState.update { it.copy(resetMessage = "Şifre sıfırlama bağlantısı için e-posta adresini yaz.") }
            return
        }

        _uiState.update { it.copy(resetLoading = true, resetMessage = null, error = null) }
        viewModelScope.launch {
            val result = authRepository.forgotPassword(email)
            _uiState.update {
                it.copy(
                    resetLoading = false,
                    resetMessage = if (result.isSuccess) {
                        result.getOrNull()?.message ?: "Eğer bu e-posta sistemde kayıtlıysa şifre sıfırlama bağlantısı gönderildi."
                    } else {
                        result.exceptionOrNull().toResetMessage()
                    }
                )
            }
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
            is HttpException -> "Şifre sıfırlama bağlantısı gönderilemedi. Lütfen tekrar dene."
            is IOException -> "İnternet bağlantını kontrol edip tekrar dene."
            else -> "Şifre sıfırlama bağlantısı gönderilemedi. Lütfen tekrar dene."
        }
    }
}
