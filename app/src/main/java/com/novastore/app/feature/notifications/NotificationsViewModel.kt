package com.novastore.app.feature.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.novastore.app.data.model.AccountCoupon
import com.novastore.app.data.model.AccountMessage
import com.novastore.app.data.model.AccountOrder
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.model.CustomerNotificationTarget
import com.novastore.app.data.model.CustomerAddress
import com.novastore.app.data.model.Notification
import com.novastore.app.data.model.ProductQuestion
import com.novastore.app.data.model.ReviewPermission
import com.novastore.app.data.model.SecurityStatus
import com.novastore.app.data.model.UserReview
import com.novastore.app.data.model.customerTargetOrNull
import com.novastore.app.data.model.resolvedProductId
import com.novastore.app.data.repository.AccountRepository
import com.novastore.app.data.repository.AuthRepository
import com.novastore.app.data.repository.CartRepository
import com.novastore.app.data.repository.CustomerLocalRepository
import com.novastore.app.data.repository.NotificationRepository
import com.novastore.app.data.repository.ProductRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Job
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
    val reviews: List<UserReview> = emptyList(),
    val reviewsError: String? = null,
    val reviewPermissionLoading: Boolean = false,
    val reviewPermission: ReviewPermission? = null,
    val reviewSubmissionLoading: Boolean = false,
    val reviewSubmissionMessage: String? = null,
    val notificationDestination: CustomerNotificationDestination? = null,
    val notificationTargetLoading: Boolean = false,
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

internal fun isLatestNotificationTargetRequest(
    requestId: Long,
    latestRequestId: Long,
    sessionCurrent: Boolean
): Boolean = requestId == latestRequestId && sessionCurrent

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val notificationRepository: NotificationRepository,
    private val accountRepository: AccountRepository,
    private val authRepository: AuthRepository,
    private val cartRepository: CartRepository,
    private val customerLocalRepository: CustomerLocalRepository,
    private val productRepository: ProductRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(NotificationsUiState())
    val uiState: StateFlow<NotificationsUiState> = _uiState.asStateFlow()
    private var notificationTargetJob: Job? = null
    private var notificationTargetRequestId = 0L
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
        notificationTargetJob?.cancel()
        notificationTargetRequestId += 1
        customerLocalRepository.refreshSessionScopedState()
        _uiState.value = NotificationsUiState()
        refreshUserProfile()
        loadAddresses()
        loadNotifications()
        loadOrders()
        loadCoupons()
    }

    fun loadAddresses() {
        val owner = authRepository.captureSession() ?: return
        _uiState.update { it.copy(addressLoading = true, addressError = null) }
        viewModelScope.launch {
            val result = customerLocalRepository.refreshAddresses()
            if (!authRepository.isSessionCurrent(owner)) return@launch
            _uiState.update {
                it.copy(
                    addressLoading = false,
                    addressError = if (result.isSuccess) null else "Adresler sunucudan alınamadı. Cihazdaki kayıtlı adresler gösteriliyor."
                )
            }
        }
    }

    fun refreshUserProfile() {
        val owner = authRepository.captureSession() ?: return
        viewModelScope.launch {
            authRepository.refreshUserProfile()
            if (!authRepository.isSessionCurrent(owner)) return@launch
            _uiState.update { it.copy(profileVersion = it.profileVersion + 1) }
        }
    }

    fun loadNotifications() {
        val owner = authRepository.captureSession()
        val userId = authRepository.currentUserId
        if (owner == null || userId == -1) {
            _uiState.update { it.copy(isLoading = false, notifications = emptyList()) }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val result = notificationRepository.getNotifications(userId)
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession() ?: return
        viewModelScope.launch {
            val result = notificationRepository.markAsRead(id, owner.generation)
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession()
        val userId = authRepository.currentUserId
        if (owner == null || userId == -1) return
        viewModelScope.launch {
            val result = notificationRepository.markAllAsRead(userId, owner.generation)
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession()
        val userId = authRepository.currentUserId
        if (owner == null || userId == -1) {
            _uiState.update { it.copy(ordersLoading = false, orders = emptyList()) }
            return
        }

        _uiState.update { it.copy(ordersLoading = true, ordersError = null) }
        viewModelScope.launch {
            val result = accountRepository.getOrders(userId)
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession() ?: return
        _uiState.update { it.copy(couponsLoading = true, couponsError = null) }
        viewModelScope.launch {
            val result = accountRepository.getCoupons()
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession() ?: return
        _uiState.update {
            if (preserveActionState) {
                it.copy(securityLoading = true, securityError = null)
            } else {
                it.copy(securityLoading = true, securityError = null, securityActionMessage = null, passwordChanged = false)
            }
        }
        viewModelScope.launch {
            val result = accountRepository.getSecurityStatus()
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession() ?: return
        _uiState.update { it.copy(securityActionLoading = true, securityActionMessage = null, passwordChanged = false) }
        viewModelScope.launch {
            val result = accountRepository.changePassword(currentPassword, newPassword, owner.generation)
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession() ?: return
        _uiState.update { it.copy(securityActionLoading = true, securityActionMessage = null, passwordChanged = false) }
        viewModelScope.launch {
            val result = accountRepository.sendPhoneCode(phone, owner.generation)
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession() ?: return
        _uiState.update { it.copy(securityActionLoading = true, securityActionMessage = null, passwordChanged = false) }
        viewModelScope.launch {
            val result = accountRepository.sendEmailVerification(owner.generation)
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        _uiState.update {
            it.copy(
                securityActionLoading = false,
                securityActionMessage = "İki adımlı doğrulama müşteriler için henüz kullanılamıyor.",
                passwordChanged = false
            )
        }
    }

    fun loadMessages() {
        val owner = authRepository.captureSession()
        val userId = authRepository.currentUserId
        if (owner == null || userId == -1) return
        _uiState.update { it.copy(messagesLoading = true, messagesError = null) }
        viewModelScope.launch {
            val result = accountRepository.getMessages(userId)
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession() ?: return
        _uiState.update { it.copy(productQuestionsLoading = true, productQuestionsError = null) }
        viewModelScope.launch {
            val result = accountRepository.getProductQuestions()
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession() ?: return
        viewModelScope.launch {
            if (!authRepository.isSessionCurrent(owner)) return@launch
            val result = accountRepository.sendMessage(trimmed, owner.generation)
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession()
        val userId = authRepository.currentUserId
        if (owner == null || userId == -1) return
        _uiState.update { it.copy(reviewsLoading = true, reviewsError = null) }
        viewModelScope.launch {
            val result = accountRepository.getReviews(userId)
            if (!authRepository.isSessionCurrent(owner)) return@launch
            _uiState.update {
                if (result.isSuccess) {
                    it.copy(reviewsLoading = false, reviews = result.getOrDefault(emptyList()))
                } else {
                    it.copy(reviewsLoading = false, reviewsError = result.exceptionOrNull()?.message ?: "Değerlendirmeler yüklenemedi.")
                }
            }
        }
    }

    fun prepareReview(productId: Int) {
        val owner = authRepository.captureSession() ?: return
        if (productId <= 0) return
        _uiState.update {
            it.copy(
                reviewPermissionLoading = true,
                reviewPermission = null,
                reviewSubmissionMessage = null
            )
        }
        viewModelScope.launch {
            val result = accountRepository.getReviewPermission(productId)
            if (!authRepository.isSessionCurrent(owner)) return@launch
            _uiState.update {
                it.copy(
                    reviewPermissionLoading = false,
                    reviewPermission = result.getOrNull(),
                    reviewSubmissionMessage = result.exceptionOrNull()?.toReviewMessage()
                )
            }
        }
    }

    fun submitReview(productId: Int, rating: Int, comment: String) {
        val owner = authRepository.captureSession() ?: return
        val normalizedComment = comment.trim()
        if (rating !in 1..5 || normalizedComment.length > 2000) {
            _uiState.update { it.copy(reviewSubmissionMessage = "Puan 1–5 arasında, yorum en fazla 2000 karakter olmalıdır.") }
            return
        }
        _uiState.update { it.copy(reviewSubmissionLoading = true, reviewSubmissionMessage = null) }
        viewModelScope.launch {
            val result = accountRepository.submitReview(productId, rating, normalizedComment, owner.generation)
            if (!authRepository.isSessionCurrent(owner)) return@launch
            _uiState.update {
                it.copy(
                    reviewSubmissionLoading = false,
                    reviewPermission = if (result.isSuccess) {
                        ReviewPermission(false, false, "ALREADY_REVIEWED", "Değerlendirmen yayın incelemesine gönderildi.")
                    } else {
                        it.reviewPermission
                    },
                    reviewSubmissionMessage = result.getOrNull()?.mesaj ?: result.exceptionOrNull().toReviewMessage()
                )
            }
            if (result.isSuccess) loadReviews()
        }
    }

    fun clearReviewComposer() {
        _uiState.update {
            it.copy(
                reviewPermissionLoading = false,
                reviewPermission = null,
                reviewSubmissionLoading = false,
                reviewSubmissionMessage = null
            )
        }
    }

    fun openNotification(notification: Notification) {
        markAsRead(notification.id)
        val owner = authRepository.captureSession()
        val target = notification.customerTargetOrNull()
        if (owner == null || target == null) {
            notificationTargetJob?.cancel()
            notificationTargetRequestId += 1
            _uiState.update { it.copy(actionMessage = "Bu bildirim için güvenli bir hedef bulunamadı.") }
            return
        }

        val userId = authRepository.currentUserId
        notificationTargetJob?.cancel()
        val requestId = ++notificationTargetRequestId
        _uiState.update {
            it.copy(
                notificationTargetLoading = true,
                notificationDestination = null,
                actionMessage = null
            )
        }
        notificationTargetJob = viewModelScope.launch {
            val destination = when (target) {
                is CustomerNotificationTarget.Product -> productRepository
                    .getProduct(target.entityId.toInt(), forceRefresh = true)
                    .getOrNull()
                    ?.let { CustomerNotificationDestination.Product(it.id) }

                is CustomerNotificationTarget.Order -> accountRepository.getOrders(userId)
                    .getOrNull()
                    ?.firstOrNull { it.id.toLong() == target.entityId }
                    ?.let(CustomerNotificationDestination::Order)

                is CustomerNotificationTarget.ProductQuestion -> accountRepository.getProductQuestions()
                    .getOrNull()
                    ?.firstOrNull { it.id.toLong() == target.entityId }
                    ?.let { CustomerNotificationDestination.ProductQuestion(target.entityId) }

                is CustomerNotificationTarget.ReturnRequest -> accountRepository.getReturnRequest(target.entityId)
                    .getOrNull()
                    ?.let(CustomerNotificationDestination::ReturnRequest)

                is CustomerNotificationTarget.Review -> accountRepository.getReviews(userId)
                    .getOrNull()
                    ?.firstOrNull { it.id.toLong() == target.entityId }
                    ?.let { CustomerNotificationDestination.Review(target.entityId) }

                is CustomerNotificationTarget.SupportThread -> accountRepository.getMessages(userId)
                    .getOrNull()
                    ?.firstOrNull { it.supportThreadId == target.entityId }
                    ?.let { CustomerNotificationDestination.SupportThread(target.entityId) }
            }
            if (!isLatestNotificationTargetRequest(
                    requestId = requestId,
                    latestRequestId = notificationTargetRequestId,
                    sessionCurrent = authRepository.isSessionCurrent(owner)
                )
            ) return@launch
            _uiState.update {
                it.copy(
                    notificationTargetLoading = false,
                    notificationDestination = destination,
                    actionMessage = if (destination == null) {
                        "İlgili kayıt bulunamadı veya artık erişilebilir değil."
                    } else {
                        null
                    }
                )
            }
        }
    }

    fun consumeNotificationDestination() {
        _uiState.update { it.copy(notificationDestination = null) }
    }

    fun repeatOrder(order: AccountOrder) {
        val owner = authRepository.captureSession() ?: return
        viewModelScope.launch {
            var added = 0
            order.items.orEmpty().forEach { item ->
                val productId = item.resolvedProductId() ?: return@forEach
                val result = cartRepository.addToCart(
                    CartItem(
                        productId = productId,
                        name = item.name ?: "NovaStore Ürünü",
                        price = item.price ?: item.lineTotal ?: 0.0,
                        imageUrl = item.image,
                        quantity = item.quantity?.coerceAtLeast(1) ?: 1
                    ),
                    owner
                )
                if (result.isSuccess) added += 1
            }
            if (!authRepository.isSessionCurrent(owner)) return@launch
            _uiState.update { it.copy(actionMessage = if (added > 0) "Ürünler sepete eklendi." else "Sepete eklenecek ürün bulunamadı.") }
        }
    }

    fun cancelOrder(orderId: Int) {
        val owner = authRepository.captureSession() ?: return
        viewModelScope.launch {
            val result = accountRepository.cancelOrder(orderId, sessionGeneration = owner.generation)
            if (!authRepository.isSessionCurrent(owner)) return@launch
            _uiState.update { it.copy(actionMessage = if (result.isSuccess) "Sipariş iptal edildi." else "Sipariş iptal edilemedi.") }
            if (result.isSuccess) loadOrders()
        }
    }

    fun updateProfile(fullName: String, phone: String?) {
        val owner = authRepository.captureSession() ?: return
        val normalizedName = fullName.trim().ifBlank { authRepository.currentUserName.orEmpty() }
        val normalizedPhone = phone?.filter { it.isDigit() || it == '+' }?.take(16)
        viewModelScope.launch {
            if (!authRepository.isSessionCurrent(owner)) return@launch
            _uiState.update { it.copy(profileSaving = true, profileSaved = false, profileError = null) }

            val result = accountRepository.updateProfile(normalizedName, normalizedPhone, owner.generation)
            if (!authRepository.isSessionCurrent(owner)) return@launch
            if (result.isSuccess) {
                val user = result.getOrThrow().user
                if (!authRepository.updateCachedProfileIfCurrent(
                        owner,
                        user.fullName,
                        user.phone
                    )
                ) return@launch
                _uiState.update {
                    if (!authRepository.isSessionCurrent(owner)) {
                        it
                    } else {
                        it.copy(
                            actionMessage = null,
                            profileVersion = it.profileVersion + 1,
                            profileSaving = false,
                            profileSaved = true,
                            profileError = null
                        )
                    }
                }
            } else {
                Timber.w(result.exceptionOrNull(), "Profile update endpoint failed.")
                _uiState.update {
                    if (!authRepository.isSessionCurrent(owner)) {
                        it
                    } else {
                        it.copy(
                            profileSaving = false,
                            profileSaved = false,
                            profileError = result.exceptionOrNull().toSecurityMessage("Profil kaydedilemedi. Lütfen tekrar dene.")
                        )
                    }
                }
            }
        }
    }

    fun clearProfileSaveState() {
        _uiState.update { it.copy(profileSaved = false, profileError = null) }
    }

    fun saveAddress(address: CustomerAddress) {
        val owner = authRepository.captureSession() ?: return
        _uiState.update { it.copy(addressLoading = true, addressError = null) }
        viewModelScope.launch {
            val result = customerLocalRepository.saveAddressSynced(address)
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession() ?: return
        _uiState.update { it.copy(addressLoading = true, addressError = null) }
        viewModelScope.launch {
            val result = customerLocalRepository.deleteAddressSynced(id)
            if (!authRepository.isSessionCurrent(owner)) return@launch
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
        val owner = authRepository.captureSession() ?: return
        _uiState.update { it.copy(addressLoading = true, addressError = null) }
        viewModelScope.launch {
            val result = customerLocalRepository.selectAddressSynced(id)
            if (!authRepository.isSessionCurrent(owner)) return@launch
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

    private fun Throwable?.toReviewMessage(): String {
        return when (this) {
            null -> "Değerlendirme durumu alınamadı."
            is IOException -> "İnternet bağlantını kontrol edip tekrar dene."
            is HttpException -> {
                val body = response()?.errorBody()?.string()
                val parsed = runCatching {
                    val json = JSONObject(body.orEmpty())
                    json.optString("error").ifBlank { json.optString("message") }
                }.getOrNull()
                parsed?.takeIf { it.isNotBlank() } ?: when (code()) {
                    401 -> "Değerlendirme yapmak için giriş yapmalısın."
                    403 -> "Bu ürün için değerlendirme yetkin bulunmuyor."
                    404 -> "Ürün artık erişilebilir değil."
                    409 -> "Bu ürünü zaten değerlendirdin."
                    else -> "Değerlendirme işlemi tamamlanamadı."
                }
            }
            else -> "Değerlendirme işlemi tamamlanamadı."
        }
    }
}
