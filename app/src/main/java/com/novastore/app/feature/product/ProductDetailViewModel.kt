package com.novastore.app.feature.product

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.model.CustomerAddress
import com.novastore.app.data.model.Product
import com.novastore.app.data.model.ProductQuestion
import com.novastore.app.data.model.AccountCoupon
import com.novastore.app.data.repository.AccountRepository
import com.novastore.app.data.repository.CartRepository
import com.novastore.app.data.repository.CustomerLocalRepository
import com.novastore.app.data.repository.ProductRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException
import timber.log.Timber
import java.io.IOException
import javax.inject.Inject

data class ProductDetailUiState(
    val isLoading: Boolean = true,
    val product: Product? = null,
    val relatedProducts: List<Product> = emptyList(),
    val error: String? = null,
    val isFavorite: Boolean = false,
    val favoriteLoading: Boolean = false,
    val addToCartLoading: Boolean = false,
    val selectedQuantity: Int = 1,
    val selectedCouponCode: String? = null,
    val couponsLoading: Boolean = false,
    val coupons: List<AccountCoupon> = emptyList(),
    val couponsError: String? = null,
    val addresses: List<CustomerAddress> = emptyList(),
    val selectedAddressId: Long = -1L,
    val questionSending: Boolean = false,
    val questionsLoading: Boolean = false,
    val questions: List<ProductQuestion> = emptyList(),
    val questionsError: String? = null
)

@HiltViewModel
class ProductDetailViewModel @Inject constructor(
    private val productRepository: ProductRepository,
    private val accountRepository: AccountRepository,
    private val cartRepository: CartRepository,
    private val customerLocalRepository: CustomerLocalRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProductDetailUiState())
    val uiState: StateFlow<ProductDetailUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            customerLocalRepository.favoriteIds.collectLatest { ids ->
                _uiState.update { state ->
                    state.copy(isFavorite = state.product?.id?.let(ids::contains) == true)
                }
            }
        }
        viewModelScope.launch {
            customerLocalRepository.addresses.collectLatest { addresses ->
                _uiState.update { it.copy(addresses = addresses) }
            }
        }
        viewModelScope.launch {
            customerLocalRepository.selectedAddressId.collectLatest { id ->
                _uiState.update { it.copy(selectedAddressId = id) }
            }
        }
        viewModelScope.launch {
            customerLocalRepository.refreshFavorites()
        }
    }

    fun loadProduct(productId: Int) {
        _uiState.update {
            it.copy(
                isLoading = true,
                product = null,
                relatedProducts = emptyList(),
                error = null,
                selectedQuantity = 1,
                selectedCouponCode = null,
                coupons = emptyList(),
                couponsError = null,
                questions = emptyList(),
                questionsError = null
            )
        }
        loadCoupons()
        viewModelScope.launch {
            val result = productRepository.getProduct(productId)
            if (result.isSuccess) {
                val product = result.getOrNull()
                val related = productRepository.getProducts()
                    .getOrDefault(emptyList())
                    .asSequence()
                    .filter { it.id != productId }
                    .sortedByDescending { it.category == product?.category }
                    .take(8)
                    .toList()
                Timber.d("Product loaded successfully: ${product?.name}")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        product = product,
                        relatedProducts = related,
                        isFavorite = product?.id?.let(customerLocalRepository.favoriteIds.value::contains) == true
                    )
                }
                loadQuestions(productId)
            } else {
                val errorMsg = result.exceptionOrNull()?.message ?: "Ürün detayları yüklenemedi."
                Timber.e("Error loading product detail: $errorMsg")
                _uiState.update { it.copy(isLoading = false, error = errorMsg) }
            }
        }
    }

    fun toggleFavorite(onResult: (Boolean, String) -> Unit) {
        val product = _uiState.value.product ?: return
        if (_uiState.value.favoriteLoading) return
        _uiState.update { it.copy(favoriteLoading = true) }
        viewModelScope.launch {
            val result = customerLocalRepository.toggleFavoriteSynced(product.id)
            val isFavorite = customerLocalRepository.favoriteIds.value.contains(product.id)
            _uiState.update { it.copy(isFavorite = isFavorite, favoriteLoading = false) }
            if (result.isSuccess) {
                onResult(isFavorite, if (isFavorite) "Favorilere eklendi." else "Favorilerden kaldırıldı.")
            } else {
                onResult(false, "Favori işlemi tamamlanamadı. Lütfen tekrar dene.")
            }
        }
    }

    fun changeQuantity(delta: Int) {
        val state = _uiState.value
        val stock = state.product?.stock ?: return
        _uiState.update {
            it.copy(selectedQuantity = (it.selectedQuantity + delta).coerceIn(1, stock.coerceAtLeast(1)))
        }
    }

    fun applyCoupon(couponCode: String) {
        _uiState.update { state ->
            state.copy(
                selectedCouponCode = nextSelectedCouponCode(
                    currentCouponCode = state.selectedCouponCode,
                    requestedCouponCode = couponCode
                )
            )
        }
    }

    fun loadCoupons() {
        if (_uiState.value.couponsLoading) return
        _uiState.update { it.copy(couponsLoading = true, couponsError = null) }
        viewModelScope.launch {
            val result = accountRepository.getCoupons()
            _uiState.update { state ->
                if (result.isSuccess) {
                    val coupons = result.getOrDefault(emptyList())
                        .filter { it.code.isNotBlank() }
                        .distinctBy { it.code }
                    state.copy(
                        couponsLoading = false,
                        coupons = coupons,
                        selectedCouponCode = state.selectedCouponCode?.takeIf { selected ->
                            coupons.any { it.code == selected }
                        }
                    )
                } else {
                    state.copy(
                        couponsLoading = false,
                        coupons = emptyList(),
                        selectedCouponCode = null,
                        couponsError = result.exceptionOrNull()?.message ?: "Kuponlar yüklenemedi."
                    )
                }
            }
        }
    }

    fun loadQuestions(productId: Int? = _uiState.value.product?.id) {
        val safeProductId = productId ?: return
        _uiState.update { it.copy(questionsLoading = true, questionsError = null) }
        viewModelScope.launch {
            val result = productRepository.getProductQuestions(safeProductId)
            _uiState.update {
                if (result.isSuccess) {
                    it.copy(questionsLoading = false, questions = result.getOrDefault(emptyList()))
                } else {
                    it.copy(questionsLoading = false, questionsError = "Sorular yüklenemedi. Lütfen tekrar dene.")
                }
            }
        }
    }

    fun selectAddress(id: Long) {
        customerLocalRepository.selectAddress(id)
    }

    fun addToCart(onResult: (Boolean, String) -> Unit) {
        val state = _uiState.value
        val product = state.product ?: return
        if (state.addToCartLoading || product.stock <= 0) return
        _uiState.update { it.copy(addToCartLoading = true) }
        viewModelScope.launch {
            val cartItem = CartItem(
                productId = product.id,
                name = product.name,
                price = product.price,
                imageUrl = product.imageUrl,
                quantity = state.selectedQuantity
            )
            val result = cartRepository.addToCart(cartItem)
            if (result.isSuccess) {
                Timber.d("Added to cart: ${product.name}")
                onResult(true, "Ürün sepete eklendi.")
            } else {
                val errorMsg = result.exceptionOrNull()?.message ?: "Sepete eklenirken bir hata oluştu."
                Timber.e("Error adding to cart: $errorMsg")
                onResult(false, errorMsg)
            }
            _uiState.update { it.copy(addToCartLoading = false) }
        }
    }

    fun submitQuestion(question: String, onResult: (Boolean, String) -> Unit) {
        val product = _uiState.value.product ?: return
        val trimmedQuestion = question.trim()
        if (trimmedQuestion.isBlank()) {
            onResult(false, "Lütfen sorunuzu yazın.")
            return
        }
        if (_uiState.value.questionSending) return

        _uiState.update { it.copy(questionSending = true) }
        viewModelScope.launch {
            val result = productRepository.askProductQuestion(product.id, trimmedQuestion)
            if (result.isSuccess) {
                val message = result.getOrNull()?.message ?: result.getOrNull()?.mesaj
                    ?: "Sorunuz satıcıya iletildi."
                Timber.d("Question submitted for product=${product.id}")
                onResult(true, message)
                loadQuestions(product.id)
            } else {
                val message = result.exceptionOrNull().toQuestionMessage()
                Timber.e("Error submitting question: $message")
                onResult(false, message)
            }
            _uiState.update { it.copy(questionSending = false) }
        }
    }

    private fun Throwable?.toQuestionMessage(): String {
        return when (this) {
            is HttpException -> when (code()) {
                401 -> "Soru sormak için giriş yapmalısın."
                400 -> "Soru gönderilemedi. Ürün ve soru bilgisini kontrol et."
                else -> "Soru gönderilemedi. Lütfen tekrar dene."
            }
            is IOException -> "İnternet bağlantını kontrol edip tekrar dene."
            else -> "Soru gönderilemedi. Lütfen tekrar dene."
        }
    }
}

internal fun nextSelectedCouponCode(
    currentCouponCode: String?,
    requestedCouponCode: String?
): String? {
    val normalizedRequestedCode = requestedCouponCode?.trim()?.takeIf { it.isNotEmpty() }
        ?: return null
    val normalizedCurrentCode = currentCouponCode?.trim()?.takeIf { it.isNotEmpty() }
    return normalizedRequestedCode.takeUnless { it == normalizedCurrentCode }
}
