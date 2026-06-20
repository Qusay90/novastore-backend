package com.novastore.app.feature.deals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.novastore.app.data.model.Product
import com.novastore.app.data.repository.CustomerLocalRepository
import com.novastore.app.data.repository.ProductRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class DealsUiState(
    val isLoading: Boolean = true,
    val deals: List<Product> = emptyList(),
    val error: String? = null
)

@HiltViewModel
class DealsViewModel @Inject constructor(
    private val productRepository: ProductRepository,
    private val customerLocalRepository: CustomerLocalRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(DealsUiState())
    val uiState: StateFlow<DealsUiState> = _uiState.asStateFlow()
    val favoriteIds: StateFlow<Set<Int>> = customerLocalRepository.favoriteIds

    init {
        loadDeals()
        viewModelScope.launch {
            customerLocalRepository.refreshFavorites()
        }
    }

    fun loadDeals(forceRefresh: Boolean = false) {
        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val result = productRepository.getProducts(forceRefresh)
            if (result.isSuccess) {
                val allProducts = result.getOrDefault(emptyList())
                // Filter products that have a discount (oldPrice > price)
                val discounted = allProducts.filter { it.oldPrice != null && it.oldPrice > it.price }
                Timber.d("Fetched ${discounted.size} deals successfully.")
                _uiState.update { it.copy(isLoading = false, deals = discounted) }
            } else {
                val errorMsg = result.exceptionOrNull()?.message ?: "Fırsatlar yüklenemedi."
                Timber.e("Error fetching deals: $errorMsg")
                _uiState.update { it.copy(isLoading = false, error = errorMsg) }
            }
        }
    }

    fun toggleFavorite(productId: Int) {
        viewModelScope.launch {
            customerLocalRepository.toggleFavoriteSynced(productId)
        }
    }
}
