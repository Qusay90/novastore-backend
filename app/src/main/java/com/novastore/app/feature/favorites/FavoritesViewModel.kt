package com.novastore.app.feature.favorites

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
import java.util.Locale
import javax.inject.Inject

enum class FavoriteFilter(val label: String) {
    ALL("Tümü"),
    DISCOUNTED("İndirimdekiler"),
    IN_STOCK("Stoktakiler"),
    OUT_OF_STOCK("Tükenenler")
}

enum class FavoriteSort(val label: String) {
    NEWEST("En yeniden eskiye"),
    PRICE_ASC("Fiyat artan"),
    PRICE_DESC("Fiyat azalan"),
    DISCOUNT_DESC("İndirim oranı yüksek"),
    IN_STOCK_FIRST("Stoktakiler önce")
}

data class FavoritesUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val products: List<Product> = emptyList(),
    val favoriteIds: Set<Int> = emptySet(),
    val searchQuery: String = "",
    val selectedFilter: FavoriteFilter = FavoriteFilter.ALL,
    val selectedSort: FavoriteSort = FavoriteSort.NEWEST,
    val removingFavoriteIds: Set<Int> = emptySet(),
    val addingToCartProductIds: Set<Int> = emptySet(),
    val undoRemovedItem: Product? = null,
    val error: String? = null
) {
    val favorites: List<Product>
        get() = products.filter { favoriteIds.contains(it.id) }

    val visibleFavorites: List<Product>
        get() {
            val normalizedQuery = searchQuery.trim().lowercase(Locale("tr", "TR"))
            val filtered = favorites
                .asSequence()
                .filter { product ->
                    normalizedQuery.isBlank() ||
                        product.name.lowercase(Locale("tr", "TR")).contains(normalizedQuery) ||
                        product.category.lowercase(Locale("tr", "TR")).contains(normalizedQuery) ||
                        product.categories.any { it.lowercase(Locale("tr", "TR")).contains(normalizedQuery) }
                }
                .filter { product ->
                    when (selectedFilter) {
                        FavoriteFilter.ALL -> true
                        FavoriteFilter.DISCOUNTED -> product.discountPercentage > 0
                        FavoriteFilter.IN_STOCK -> product.stock > 0
                        FavoriteFilter.OUT_OF_STOCK -> product.stock <= 0
                    }
                }
                .toList()

            return when (selectedSort) {
                FavoriteSort.NEWEST -> filtered.sortedByDescending { it.id }
                FavoriteSort.PRICE_ASC -> filtered.sortedBy { it.price }
                FavoriteSort.PRICE_DESC -> filtered.sortedByDescending { it.price }
                FavoriteSort.DISCOUNT_DESC -> filtered.sortedByDescending { it.discountPercentage }
                FavoriteSort.IN_STOCK_FIRST -> filtered.sortedWith(
                    compareByDescending<Product> { it.stock > 0 }.thenByDescending { it.id }
                )
            }
        }
}

@HiltViewModel
class FavoritesViewModel @Inject constructor(
    private val productRepository: ProductRepository,
    private val customerLocalRepository: CustomerLocalRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(FavoritesUiState())
    val uiState: StateFlow<FavoritesUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            customerLocalRepository.favoriteIds.collect { ids ->
                _uiState.update { it.copy(favoriteIds = ids) }
            }
        }
        viewModelScope.launch {
            customerLocalRepository.refreshFavorites()
        }
        loadProducts()
    }

    fun loadProducts(forceRefresh: Boolean = false) {
        val current = _uiState.value
        if (current.isRefreshing || (current.isLoading && current.products.isNotEmpty())) return

        _uiState.update {
            it.copy(
                isLoading = it.products.isEmpty(),
                isRefreshing = forceRefresh && it.products.isNotEmpty(),
                error = null
            )
        }
        viewModelScope.launch {
            val result = productRepository.getProducts(forceRefresh)
            if (result.isSuccess) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        products = result.getOrDefault(emptyList())
                    )
                }
            } else {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = result.exceptionOrNull()?.message ?: "Favorilerin yüklenemedi."
                    )
                }
            }
        }
    }

    fun updateSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun selectFilter(filter: FavoriteFilter) {
        _uiState.update { it.copy(selectedFilter = filter) }
    }

    fun selectSort(sort: FavoriteSort) {
        _uiState.update { it.copy(selectedSort = sort) }
    }

    fun removeFavorite(product: Product) {
        _uiState.update {
            it.copy(
                removingFavoriteIds = it.removingFavoriteIds + product.id,
                undoRemovedItem = product
            )
        }
        viewModelScope.launch {
            customerLocalRepository.setFavoriteSynced(product.id, false)
            _uiState.update { it.copy(removingFavoriteIds = it.removingFavoriteIds - product.id) }
        }
    }

    fun undoRemoveFavorite() {
        val product = _uiState.value.undoRemovedItem ?: return
        viewModelScope.launch {
            customerLocalRepository.setFavoriteSynced(product.id, true)
            _uiState.update { it.copy(undoRemovedItem = null) }
        }
    }

    fun clearUndoRemovedItem() {
        _uiState.update { it.copy(undoRemovedItem = null) }
    }

    fun setAddingToCart(productId: Int, isAdding: Boolean) {
        _uiState.update {
            it.copy(
                addingToCartProductIds = if (isAdding) {
                    it.addingToCartProductIds + productId
                } else {
                    it.addingToCartProductIds - productId
                }
            )
        }
    }
}
