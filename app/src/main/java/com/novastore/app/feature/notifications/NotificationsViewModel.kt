package com.novastore.app.feature.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.novastore.app.data.model.AccountCoupon
import com.novastore.app.data.model.AccountMessage
import com.novastore.app.data.model.AccountOrder
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.model.CustomerAddress
import com.novastore.app.data.model.Notification
import com.novastore.app.data.model.ProductQuestion
import com.novastore.app.data.model.SecurityStatus
import com.novastore.app.data.repository.AccountRepository
import com.novastore.app.data.repository.AuthRepository
import com.novastore.app.data.repository.CartRepository
import com.novastore.app.data.repository.CustomerLocalRepository
import com.novastore.app.data.repository.NotificationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import retrofit2.HttpException
import timber.log.Timber
import java.io.IOException
import javax.inject.Inject

data class NotificationsUiState(
    val isLoading: Boolean = true,
    val notifications: List<Notification> = emptyList(),
    val error: String? = null,
    val ordersLoading: Boolean = true,
    val orders: List<AccountOrder> = emptyList(),
    val ordersError: String? = null,
    val couponsLoading: Boolean = true,
    val coupons: List<AccountCoupon> = emptyList(),
    val couponsError: String? = null,
    val messagesLoading: Boolean = false,
    val messages: List<AccountMessage> = emptyList(),
    val messagesError: String? = null,
    val productQuestionsLoading: Boolean = false,
    val productQuestions: List<ProductQuestion> = emptyList(),
    val productQuestionsError: String? = null,
    val reviewsLoading: Boolean = false,
    val reviews: List<com.novastore.app.data.model.UserReview> = emptyList(),
    val reviewsError: String? = null,
    val actionMessage: String? = null,
    val profileVersion: Int = 0,
    val securityLoading: Boolean = false,
    val securityStatus: SecurityStatus? = null,
    val securityError: String? = null,
    val securityActionLoading: Boolean = false,
    val securityActionMessage: String? = null,
    val passwordChanged: Boolean = false,
    val profileSaving: Boolean = false,
    val profileSaved: Boolean = false,
    val profileError: String? = null,
    val addressLoading: Boolean = false,
    val addressError: String? = null
)

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val notificationRepository: NotificationRepository,
    private val accountRepository: AccountRepository,
    private val authRepository: AuthRepository,
    private val cartRepository: CartRepository,
    private val customerLocalRepository: CustomerLocalRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(NotificationsUiState())
    val uiState: StateFlow<NotificationsUiState> = _uiState.asStateFlow()
    val favoriteIds = customerLocalRepository.favoriteIds
    val addresses = customerLocalRepository.addresses

    val currentUserName: String?
        get() = authRepository.currentUserName

    val currentUserEmail: String?
        get() = authRepository.currentUserEmail

    val currentUserPhone: String?
        get() = authRepository.currentUserPhone

    val currentUserId: Int
        get() = authRepository.currentUserId

    fun loadAccount() {
        refreshUserProfile()
        loadAddresses()
        loadNotifications()
        loadOrders()
        loadCoupons()
    }

    fun loadAddresses() {
        _uiState.update { it.copy(addressLoading = true, addressError = null) }
        viewModelScope.launch {
            val result = customerLocalRepository.refreshAddresses()
            _uiState.update {
                it.copy(
                    addressLoading = false,
                    addressError = if (result.isSuccess) null else "Adresler sunucudan alınamadı. Cihazdaki kayıtlı adresler gösteriliyor."
                )
            }
        }
    }

    fun refreshUserProfile() {
        if (authRepository.currentUserId == -1) return
        viewModelScope.launch {
            authRepository.refreshUserProfile()
            _uiState.update { it.copy(profileVersion = it.profileVersion + 1) }
        }
    }

    fun loadNotifications() {
        val userId = authRepository.currentUserId
        if (userId == -1) {
            _uiState.update { it.copy(isLoading = false, notifications = emptyList()) }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val result = notificationRepository.getNotifications(userId)
            if (result.isSuccess) {
                val list = result.getOrDefault(emptyList())
                Timber.d("Notifications loaded successfully: size=${list.size}")
                _uiState.update { it.copy(isLoading = false, notifications = list) }
            } else {
                val errorMsg = result.exceptionOrNull()?.message ?: "Bildirimler yüklenemedi."
                Timber.e("Error loading notifications: $errorMsg")
                _uiState.update { it.copy(isLoading = false, error = errorMsg) }
            }
        }
    }

    fun markAsRead(id: Int) {
        viewModelScope.launch {
            val result = notificationRepository.markAsRead(id)
            if (result.isSuccess) {
                Timber.d("Notification marked as read: id=$id")
                // Refresh list locally
                val updatedList = _uiState.value.notifications.map { notif ->
                    if (notif.id == id) notif.copy(isRead = true) else notif
                }
                _uiState.update { it.copy(notifications = updatedList) }
            } else {
                Timber.e("Error marking notification read: id=$id")
            }
        }
    }

    fun markAllAsRead() {
        val userId = authRepository.currentUserId
        if (userId == -1) return
        viewModelScope.launch {
            val result = notificationRepository.markAllAsRead(userId)
            if (result.isSuccess) {
                _uiState.update { state ->
                    state.copy(
                        notifications = state.notifications.map { it.copy(isRead = true) },
                        actionMessage = "Tüm bildirimler okundu."
                    )
                }
            } else {
                _uiState.update { it.copy(actionMessage = "Bildirimler güncellenemedi.") }
            }
        }
    }

    fun loadOrders() {
        val userId = authRepository.currentUserId
        if (userId == -1) {
            _uiState.update { it.copy(ordersLoading = false, orders = emptyList()) }
            return
        }

        _uiState.update { it.copy(ordersLoading = true, ordersError = null) }
        viewModelScope.launch {
            val result = accountRepository.getOrders(userId)
            _uiState.update {
                if (result.isSuccess) {
                    it.copy(ordersLoading = false, orders = result.getOrDefault(emptyList()))
                } else {
                    it.copy(ordersLoading = false, ordersError = result.exceptionOrNull()?.message ?: "Siparişler yüklenemedi.")
                }
            }
        }
    }

    fun loadCoupons() {
        _uiState.update { it.copy(couponsLoading = true, couponsError = null) }
        viewModelScope.launch {
            val result = accountRepository.getCoupons()
            _uiState.update {
                if (result.isSuccess) {
                    it.copy(couponsLoading = false, coupons = result.getOrDefault(emptyList()))
                } else {
                    it.copy(couponsLoading = false, couponsError = result.exceptionOrNull()?.message ?: "Kuponlar yüklenemedi.")
                }
            }
        }
    }

    fun loadSecurityStatus(preserveActionState: Boolean = false) {
        _uiState.update {
            if (preserveActionState) {
                it.copy(securityLoading = true, securityError = null)
            } else {
                it.copy(securityLoading = true, securityError = null, securityActionMessage = null, passwordChanged = false)
            }
        }
        viewModelScope.launch {
            val result = accountRepository.getSecurityStatus()
            _uiState.update {
                if (result.isSuccess) {
                    it.copy(securityLoading = false, securityStatus = result.getOrNull(), securityError = null)
                } else {
                    it.copy(securityLoading = false, securityError = "Güvenlik durumu alınamadı. İnternet bağlantını kontrol edip tekrar dene.")
                }
            }
        }
    }

    fun changePassword(currentPassword: String, newPassword: String, repeatPassword: String) {
        val validation = validatePasswordChange(currentPassword, newPassword, repeatPassword)
        if (validation != null) {
            _uiState.update { it.copy(securityActionMessage = validation, passwordChanged = false) }
            return
        }
        _uiState.update { it.copy(securityActionLoading = true, securityActionMessage = null, passwordChanged = false) }
        viewModelScope.launch {
            val result = accountRepository.changePassword(currentPassword, newPassword)
            _uiState.update {
                if (result.isSuccess) {
                    it.copy(
                        securityActionLoading = false,
                        securityActionMessage = result.getOrNull()?.message ?: "Şifren başarıyla güncellendi.",
                        passwordChanged = true
                    )
                } else {
                    it.copy(
                        securityActionLoading = false,
                        securityActionMessage = result.exceptionOrNull().toSecurityMessage("Şifre güncellenemedi. Lütfen tekrar dene."),
                        passwordChanged = false
                    )
                }
            }
            if (result.isSuccess) loadSecurityStatus(preserveActionState = true)
        }
    }

    fun sendPasswordReset(email: String?) {
        val targetEmail = email?.takeIf { it.isNotBlank() } ?: currentUserEmail.orEmpty()
        if (targetEmail.isBlank()) {
            _uiState.update { it.copy(securityActionMessage = "Sıfırlama bağlantısı için e-posta adresi gerekli.") }
            return
        }
        _uiState.update { it.copy(securityActionLoading = true, securityActionMessage = null, passwordChanged = false) }
        viewModelScope.launch {
            val result = accountRepository.forgotPassword(targetEmail)
            _uiState.update {
                it.copy(
                    securityActionLoading = false,
                    securityActionMessage = if (result.isSuccess) {
                        result.getOrNull()?.message ?: "Eğer bu e-posta sistemde kayıtlıysa şifre sıfırlama bağlantısı gönderildi."
                    } else {
                        "Sıfırlama bağlantısı gönderilemedi. Biraz sonra tekrar dene."
                    },
                    passwordChanged = false
                )
            }
        }
    }

    fun sendPhoneVerification(phone: String?) {
        _uiState.update { it.copy(securityActionLoading = true, securityActionMessage = null, passwordChanged = false) }
        viewModelScope.launch {
            val result = accountRepository.sendPhoneCode(phone)
            _uiState.update {
                it.copy(
                    securityActionLoading = false,
                    securityActionMessage = if (result.isSuccess) {
                        result.getOrNull()?.message ?: "Doğrulama kodu gönderildi."
                    } else {
                        "SMS doğrulama servisi şu anda kullanılamıyor."
                    },
                    passwordChanged = false
                )
            }
        }
    }

    fun sendEmailVerification() {
        _uiState.update { it.copy(securityActionLoading = true, securityActionMessage = null, passwordChanged = false) }
        viewModelScope.launch {
            val result = accountRepository.sendEmailVerification()
            _uiState.update {
                it.copy(
                    securityActionLoading = false,
                    securityActionMessage = if (result.isSuccess) {
                        result.getOrNull()?.message ?: "Doğrulama e-postası gönderildi."
                    } else {
                        "E-posta doğrulama servisi şu anda kullanılamıyor."
                    },
                    passwordChanged = false
                )
            }
        }
    }

    fun setupTwoFactor() {
        _uiState.update { it.copy(securityActionLoading = true, securityActionMessage = null, passwordChanged = false) }
        viewModelScope.launch {
            val result = accountRepository.setupTwoFactor()
            _uiState.update {
                it.copy(
                    securityActionLoading = false,
                    securityActionMessage = if (result.isSuccess) {
                        result.getOrNull()?.message ?: "İki adımlı doğrulama kurulumu başlatıldı."
                    } else {
                        "İki adımlı doğrulama altyapısı henüz yapılandırılmadı."
                    },
                    passwordChanged = false
                )
            }
        }
    }

    fun loadMessages() {
        val userId = authRepository.currentUserId
        if (userId == -1) return
        _uiState.update { it.copy(messagesLoading = true, messagesError = null) }
        viewModelScope.launch {
            val result = accountRepository.getMessages(userId)
            _uiState.update {
                if (result.isSuccess) {
                    it.copy(messagesLoading = false, messages = result.getOrDefault(emptyList()))
                } else {
                    it.copy(messagesLoading = false, messagesError = result.exceptionOrNull()?.message ?: "Destek mesajları yüklenemedi.")
                }
            }
        }
    }

    fun loadProductQuestions() {
        if (authRepository.currentUserId == -1) return
        _uiState.update { it.copy(productQuestionsLoading = true, productQuestionsError = null) }
        viewModelScope.launch {
            val result = accountRepository.getProductQuestions()
            _uiState.update {
                if (result.isSuccess) {
                    it.copy(productQuestionsLoading = false, productQuestions = result.getOrDefault(emptyList()))
                } else {
                    it.copy(productQuestionsLoading = false, productQuestionsError = result.exceptionOrNull()?.message ?: "Sorularınız yüklenemedi.")
                }
            }
        }
    }

    fun sendSupportMessage(message: String) {
        val trimmed = message.trim()
        if (trimmed.isEmpty()) return
        viewModelScope.launch {
            val result = accountRepository.sendMessage(trimmed)
            if (result.isSuccess) {
                val sent = result.getOrThrow()
                _uiState.update { it.copy(messages = it.messages + sent, actionMessage = "Mesaj gönderildi.") }
                loadMessages()
            } else {
                _uiState.update { it.copy(actionMessage = "Mesaj gönderilemedi.") }
            }
        }
    }

    fun loadReviews() {
        val userId = authRepository.currentUserId
        if (userId == -1) return
        _uiState.update { it.copy(reviewsLoading = true, reviewsError = null) }
        viewModelScope.launch {
            val result = accountRepository.getReviews(userId)
            _uiState.update {
                if (result.isSuccess) {
                    it.copy(reviewsLoading = false, reviews = result.getOrDefault(emptyList()))
                } else {
                    it.copy(reviewsLoading = false, reviewsError = result.exceptionOrNull()?.message ?: "Değerlendirmeler yüklenemedi.")
                }
            }
        }
    }

    fun repeatOrder(order: AccountOrder) {
        viewModelScope.launch {
            var added = 0
            order.items.orEmpty().forEach { item ->
                val productId = item.id ?: return@forEach
                val result = cartRepository.addToCart(
                    CartItem(
                        productId = productId,
                        name = item.name ?: "NovaStore Ürünü",
                        price = item.price ?: item.lineTotal ?: 0.0,
                        imageUrl = item.image,
                        quantity = item.quantity?.coerceAtLeast(1) ?: 1
                    )
                )
                if (result.isSuccess) added += 1
            }
            _uiState.update { it.copy(actionMessage = if (added > 0) "Ürünler sepete eklendi." else "Sepete eklenecek ürün bulunamadı.") }
        }
    }

    fun cancelOrder(orderId: Int) {
        viewModelScope.launch {
            val result = accountRepository.cancelOrder(orderId)
            _uiState.update { it.copy(actionMessage = if (result.isSuccess) "Sipariş iptal edildi." else "Sipariş iptal edilemedi.") }
            if (result.isSuccess) loadOrders()
        }
    }

    fun requestReturn(orderId: Int) {
        viewModelScope.launch {
            val result = accountRepository.requestReturn(orderId, "Hesabım ekranından iade talebi oluşturuldu.")
            _uiState.update { it.copy(actionMessage = if (result.isSuccess) "İade talebiniz alındı." else "İade talebi oluşturulamadı.") }
            if (result.isSuccess) loadOrders()
        }
    }

    fun updateProfile(fullName: String, phone: String?) {
        viewModelScope.launch {
            val normalizedName = fullName.trim().ifBlank { authRepository.currentUserName.orEmpty() }
            val normalizedPhone = phone?.filter { it.isDigit() || it == '+' }?.take(16)
            _uiState.update { it.copy(profileSaving = true, profileSaved = false, profileError = null) }

            val result = accountRepository.updateProfile(normalizedName, normalizedPhone)
            if (result.isSuccess) {
                val user = result.getOrThrow().user
                authRepository.updateCachedProfile(user.fullName, user.phone)
                _uiState.update {
                    it.copy(
                        actionMessage = null,
                        profileVersion = it.profileVersion + 1,
                        profileSaving = false,
                        profileSaved = true,
                        profileError = null
                    )
                }
            } else {
                Timber.w(result.exceptionOrNull(), "Profile update endpoint failed.")
                _uiState.update {
                    it.copy(
                        profileSaving = false,
                        profileSaved = false,
                        profileError = result.exceptionOrNull().toSecurityMessage("Profil kaydedilemedi. Lütfen tekrar dene.")
                    )
                }
            }
        }
    }

    fun clearProfileSaveState() {
        _uiState.update { it.copy(profileSaved = false, profileError = null) }
    }

    fun saveAddress(address: CustomerAddress) {
        _uiState.update { it.copy(addressLoading = true, addressError = null) }
        viewModelScope.launch {
            val result = customerLocalRepository.saveAddressSynced(address)
            _uiState.update {
                it.copy(
                    addressLoading = false,
                    actionMessage = if (result.isSuccess) "Adres kaydedildi." else "Adres cihazda kaydedildi, sunucuya gönderilemedi.",
                    addressError = if (result.isSuccess) null else "Adres sunucuyla eşitlenemedi."
                )
            }
        }
    }

    fun deleteAddress(id: Long) {
        _uiState.update { it.copy(addressLoading = true, addressError = null) }
        viewModelScope.launch {
            val result = customerLocalRepository.deleteAddressSynced(id)
            _uiState.update {
                it.copy(
                    addressLoading = false,
                    actionMessage = if (result.isSuccess) "Adres silindi." else "Adres cihazdan silindi, sunucu güncellenemedi.",
                    addressError = if (result.isSuccess) null else "Adres silme işlemi sunucuyla eşitlenemedi."
                )
            }
        }
    }

    fun selectAddress(id: Long) {
        _uiState.update { it.copy(addressLoading = true, addressError = null) }
        viewModelScope.launch {
            val result = customerLocalRepository.selectAddressSynced(id)
            _uiState.update {
                it.copy(
                    addressLoading = false,
                    actionMessage = if (result.isSuccess) "Varsayılan adres seçildi." else "Varsayılan adres cihazda seçildi, sunucu güncellenemedi.",
                    addressError = if (result.isSuccess) null else "Varsayılan adres sunucuyla eşitlenemedi."
                )
            }
        }
    }

    fun clearActionMessage() {
        _uiState.update { it.copy(actionMessage = null) }
    }

    fun clearSecurityActionMessage() {
        _uiState.update { it.copy(securityActionMessage = null, passwordChanged = false) }
    }

    fun logout() {
        authRepository.logout()
    }

    private fun validatePasswordChange(currentPassword: String, newPassword: String, repeatPassword: String): String? {
        if (currentPassword.isBlank()) return "Mevcut şifre boş olamaz."
        if (newPassword.isBlank()) return "Yeni şifre boş olamaz."
        if (repeatPassword.isBlank()) return "Yeni şifre tekrarı boş olamaz."
        if (newPassword.length < 8) return "Yeni şifre en az 8 karakter olmalı."
        if (!newPassword.any(Char::isLetter) || !newPassword.any(Char::isDigit)) return "Yeni şifre harf ve rakam içermeli."
        if (newPassword == currentPassword) return "Yeni şifre mevcut şifre ile aynı olamaz."
        if (newPassword != repeatPassword) return "Yeni şifreler eşleşmiyor."
        return null
    }

    private fun Throwable?.toSecurityMessage(fallback: String): String {
        return when (this) {
            is IOException -> "İnternet bağlantını kontrol edip tekrar dene."
            is HttpException -> {
                val body = response()?.errorBody()?.string()
                val parsed = runCatching {
                    val json = JSONObject(body.orEmpty())
                    json.optString("error").ifBlank { json.optString("message") }
                }.getOrNull()
                parsed?.takeIf { it.isNotBlank() } ?: fallback
            }
            else -> fallback
        }
    }
}
