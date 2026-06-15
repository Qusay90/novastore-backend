package com.novastore.app.feature.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.novastore.app.data.model.*
import com.novastore.app.data.repository.AuthRepository
import com.novastore.app.data.repository.CartRepository
import com.novastore.app.data.repository.CustomerLocalRepository
import com.novastore.app.data.repository.PaymentRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class CheckoutUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val successResponse: PaymentResponse? = null
)

@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val cartRepository: CartRepository,
    private val paymentRepository: PaymentRepository,
    private val customerLocalRepository: CustomerLocalRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(CheckoutUiState())
    val uiState: StateFlow<CheckoutUiState> = _uiState.asStateFlow()

    val cartItems: StateFlow<List<CartItem>> = cartRepository.cartItems
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    val cartTotal: StateFlow<Double> = cartItems
        .map { items -> items.sumOf { it.price * it.quantity } }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = 0.0
        )
    val addresses = customerLocalRepository.addresses
    val selectedAddressId = customerLocalRepository.selectedAddressId

    val currentUserName: String
        get() = authRepository.currentUserName.orEmpty()

    val currentUserEmail: String
        get() = authRepository.currentUserEmail.orEmpty()

    val currentUserPhone: String
        get() = authRepository.currentUserPhone.orEmpty()

    init {
        viewModelScope.launch {
            customerLocalRepository.refreshAddresses()
        }
    }

    fun selectAddress(id: Long) {
        viewModelScope.launch {
            customerLocalRepository.selectAddressSynced(id)
        }
    }

    fun initializePayment(
        fullName: String,
        email: String,
        phone: String,
        address: String,
        paymentMethod: String,
        checkoutItems: List<CartItem>? = null,
        clearCartOnSuccess: Boolean = true,
        onRedirectionRequested: (String) -> Unit
    ) {
        if (fullName.isBlank() || email.isBlank() || phone.isBlank() || address.isBlank()) {
            _uiState.update { it.copy(error = "Lütfen tüm teslimat bilgilerini eksiksiz doldurun.") }
            return
        }
        if (!phone.matches(Regex("^05\\d{9}$"))) {
            _uiState.update { it.copy(error = "Telefon numarası 05 ile başlamalı ve 11 hane olmalı.") }
            return
        }
        val itemsToPay = checkoutItems ?: cartItems.value
        if (itemsToPay.isEmpty()) {
            _uiState.update { it.copy(error = "Sepetiniz boş olduğu için ödeme başlatılamaz.") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val itemsForPayment = itemsToPay.map { item ->
                CartItemForPayment(
                    productId = item.productId,
                    name = item.name,
                    price = item.price,
                    imageUrl = item.imageUrl,
                    quantity = item.quantity
                )
            }

            val request = PaymentRequest(
                fullName = fullName,
                email = email,
                phone = phone,
                address = address,
                cartItems = itemsForPayment,
                paymentMethod = paymentMethod
            )

            val result = paymentRepository.initializePayment(request)
            if (result.isSuccess) {
                val response = result.getOrThrow()
                Timber.d("Payment initialized successfully: orderId=${response.orderId}")
                
                // Clear the local cart on successful transaction start
                if (clearCartOnSuccess) {
                    cartRepository.clearCart()
                }
                
                _uiState.update { it.copy(isLoading = false, successResponse = response) }

                // Check for card 3D redirect
                val redirectUrl = response.paymentAction?.action?.successUrl
                if (paymentMethod == "card" && !redirectUrl.isNullOrEmpty()) {
                    Timber.d("Card redirection requested to: $redirectUrl")
                    onRedirectionRequested(redirectUrl)
                }
            } else {
                val errorMsg = result.exceptionOrNull()?.message ?: "Ödeme başlatılamadı. Sunucu hatası oluştu."
                Timber.e("Error initializing payment: $errorMsg")
                _uiState.update { it.copy(isLoading = false, error = errorMsg) }
            }
        }
    }
}
