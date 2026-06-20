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
    val successResponse: PaymentResponse? = null,
    val isCheckingPaymentStatus: Boolean = false,
    val paymentStatusMessage: String? = null,
    val paymentFinalized: Boolean = false
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
    private var clearCartWhenPaymentFinalized: Boolean = false

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
        clearCartWhenFinalized: Boolean = true,
        onRedirectionRequested: (String) -> Unit
    ) {
        if (fullName.isBlank() || email.isBlank() || phone.isBlank() || address.isBlank()) {
            _uiState.update { it.copy(error = "L\u00FCtfen t\u00FCm teslimat bilgilerini eksiksiz doldurun.") }
            return
        }
        if (!phone.matches(Regex("^05\\d{9}$"))) {
            _uiState.update { it.copy(error = "Telefon numaras\u0131 05 ile ba\u015Flamal\u0131 ve 11 hane olmal\u0131.") }
            return
        }
        val itemsToPay = checkoutItems ?: cartItems.value
        if (itemsToPay.isEmpty()) {
            _uiState.update { it.copy(error = "Sepetiniz bo\u015F oldu\u011Fu i\u00E7in \u00F6deme ba\u015Flat\u0131lamaz.") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }
        clearCartWhenPaymentFinalized = clearCartWhenFinalized
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

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        successResponse = response,
                        paymentStatusMessage = response.message,
                        paymentFinalized = false
                    )
                }

                // Check for card 3D redirect
                val redirectUrl = response.paymentAction?.action?.successUrl
                if (paymentMethod == "card" && !redirectUrl.isNullOrEmpty()) {
                    Timber.d("Card redirection requested to: $redirectUrl")
                    onRedirectionRequested(redirectUrl)
                }
            } else {
                val errorMsg = result.exceptionOrNull()?.message ?: "\u00D6deme ba\u015Flat\u0131lamad\u0131. Sunucu hatas\u0131 olu\u015Ftu."
                Timber.e("Error initializing payment: $errorMsg")
                _uiState.update { it.copy(isLoading = false, error = errorMsg) }
            }
        }
    }

    fun refreshPaymentStatus() {
        val response = _uiState.value.successResponse ?: return
        val paymentRef = response.paymentRef?.takeIf { it.isNotBlank() } ?: return

        _uiState.update { it.copy(isCheckingPaymentStatus = true, error = null) }
        viewModelScope.launch {
            val result = paymentRepository.getPaymentStatus(paymentRef = paymentRef, orderId = response.orderId)
            if (result.isSuccess) {
                val status = result.getOrThrow()
                if (status.finalized && status.paymentStatus == "PAID" && clearCartWhenPaymentFinalized) {
                    cartRepository.clearCart()
                }
                _uiState.update {
                    it.copy(
                        isCheckingPaymentStatus = false,
                        paymentStatusMessage = status.message,
                        paymentFinalized = status.finalized && status.paymentStatus == "PAID"
                    )
                }
            } else {
                val errorMsg = result.exceptionOrNull()?.message ?: "\u00D6deme durumu kontrol edilemedi."
                _uiState.update { it.copy(isCheckingPaymentStatus = false, error = errorMsg) }
            }
        }
    }
}
