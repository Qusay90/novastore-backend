package com.novastore.app.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.novastore.app.data.model.Category
import com.novastore.app.data.model.findCategoryTrail
import com.novastore.app.data.model.CustomerAddress
import com.novastore.app.data.model.Product
import com.novastore.app.data.repository.CustomerLocalRepository
import com.novastore.app.data.repository.ProductRepository
import com.novastore.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale
import timber.log.Timber
import javax.inject.Inject

enum class HomeProductFilter(val label: String) {
    ALL("Tümü"),
    DISCOUNTED("İndirimdekiler"),
    IN_STOCK("Stoktakiler"),
    OUT_OF_STOCK("Tükenenler")
}

enum class HomeProductSort(val label: String) {
    FEATURED("Öne çıkanlar"),
    NEWEST("En yeni"),
    PRICE_ASC("Fiyat artan"),
    PRICE_DESC("Fiyat azalan"),
    DISCOUNT_DESC("İndirim oranı yüksek"),
    RATING_DESC("Puanı yüksek")
}

data class HomeUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val products: List<Product> = emptyList(),
    val categories: List<Category> = emptyList(),
    val selectedCategorySlug: String? = null,
    val selectedCategoryId: Int? = null,
    val categoryBreadcrumb: List<Category> = emptyList(),
    val searchQuery: String = "",
    val selectedFilter: HomeProductFilter = HomeProductFilter.ALL,
    val selectedSort: HomeProductSort = HomeProductSort.FEATURED,
    val error: String? = null
) {
    val selectedCategory: String?
        get() = categoryBreadcrumb.lastOrNull()?.name

    val filteredProducts: List<Product>
        get() {
            val normalizedQuery = searchQuery.trim().lowercase(Locale("tr", "TR"))
            val filtered = products.filter { product ->
                val matchesSearch = normalizedQuery.isBlank() ||
                        product.name.lowercase(Locale("tr", "TR")).contains(normalizedQuery) ||
                        product.category.lowercase(Locale("tr", "TR")).contains(normalizedQuery) ||
                        product.categories.any { it.lowercase(Locale("tr", "TR")).contains(normalizedQuery) } ||
                        (product.description?.lowercase(Locale("tr", "TR"))?.contains(normalizedQuery) == true)

                val matchesFilter = when (selectedFilter) {
                    HomeProductFilter.ALL -> true
                    HomeProductFilter.DISCOUNTED -> product.discountPercentage > 0
                    HomeProductFilter.IN_STOCK -> product.stock > 0
                    HomeProductFilter.OUT_OF_STOCK -> product.stock <= 0
                }
                
                matchesSearch && matchesFilter
            }

            val sorted = when (selectedSort) {
                HomeProductSort.FEATURED -> filtered
                HomeProductSort.NEWEST -> filtered.sortedByDescending { it.id }
                HomeProductSort.PRICE_ASC -> filtered.sortedBy { it.price }
                HomeProductSort.PRICE_DESC -> filtered.sortedByDescending { it.price }
                HomeProductSort.DISCOUNT_DESC -> filtered.sortedByDescending { it.discountPercentage }
                HomeProductSort.RATING_DESC -> filtered.sortedByDescending { it.averageRating.toDoubleOrNull() ?: 0.0 }
            }
            return sorted.sortedByDescending { it.stock > 0 }
        }
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val productRepository: ProductRepository,
    private val customerLocalRepository: CustomerLocalRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()
    val favoriteIds: StateFlow<Set<Int>> = customerLocalRepository.favoriteIds
    val addresses: StateFlow<List<CustomerAddress>> = customerLocalRepository.addresses
    val selectedAddressId: StateFlow<Long> = customerLocalRepository.selectedAddressId

    val currentUserPhone: String
        get() = authRepository.currentUserPhone.orEmpty()

    init {
        loadData()
        refreshAddresses()
        refreshFavorites()
    }

    fun refreshAddresses() {
        viewModelScope.launch {
            customerLocalRepository.refreshAddresses()
        }
    }

    fun refreshFavorites() {
        viewModelScope.launch {
            customerLocalRepository.refreshFavorites()
        }
    }

    fun loadData(forceRefresh: Boolean = false) {
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
            val productsResult = productRepository.getProducts(
                forceRefresh = forceRefresh,
                categorySlug = current.selectedCategorySlug
            )
            val categoriesResult = productRepository.getCategories(forceRefresh)

            if (productsResult.isSuccess && categoriesResult.isSuccess) {
                val products = productsResult.getOrDefault(emptyList())
                val categories = categoriesResult.getOrDefault(emptyList())
                val trail = categories.findCategoryTrail(current.selectedCategorySlug)
                
                Timber.d("Fetched ${products.size} products and ${categories.size} categories successfully.")
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        products = products,
                        categories = categories,
                        selectedCategoryId = trail.lastOrNull()?.id,
                        selectedCategorySlug = trail.lastOrNull()?.slug,
                        categoryBreadcrumb = trail
                    )
                }
            } else {
                val errorMsg = productsResult.exceptionOrNull()?.message 
                    ?: categoriesResult.exceptionOrNull()?.message 
                    ?: "Veriler yüklenirken bilinmeyen bir hata oluştu."
                
                Timber.e("Error fetching data: $errorMsg")
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = errorMsg
                    )
                }
            }
        }
    }

    fun selectCategory(category: Category?) {
        val current = _uiState.value
        val trail = current.categories.findCategoryTrail(category?.slug)
        Timber.d("Selected category changed to slug: ${category?.slug}")
        _uiState.update {
            it.copy(
                selectedCategorySlug = category?.slug,
                selectedCategoryId = category?.id,
                categoryBreadcrumb = trail,
                isRefreshing = true,
                error = null
            )
        }
        viewModelScope.launch {
            productRepository.getProducts(categorySlug = category?.slug)
                .onSuccess { products ->
                    _uiState.update { state ->
                        if (state.selectedCategorySlug == category?.slug) {
                            state.copy(products = products, isRefreshing = false)
                        } else {
                            state
                        }
                    }
                }
                .onFailure { error ->
                    _uiState.update { state ->
                        if (state.selectedCategorySlug == category?.slug) {
                            state.copy(
                                isRefreshing = false,
                                error = error.message ?: "Kategori ürünleri yüklenemedi."
                            )
                        } else {
                            state
                        }
                    }
                }
        }
    }

    fun navigateToParentCategory() {
        val parent = _uiState.value.categoryBreadcrumb.dropLast(1).lastOrNull()
        selectCategory(parent)
    }

    fun updateSearchQuery(query: String) {
        // Prevent logging sensitive customer search queries by keeping logs broad
        Timber.d("Search query updated")
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun selectFilter(filter: HomeProductFilter) {
        _uiState.update { it.copy(selectedFilter = filter) }
    }

    fun selectSort(sort: HomeProductSort) {
        _uiState.update { it.copy(selectedSort = sort) }
    }

    fun resetCatalogPosition() {
        _uiState.update {
            it.copy(
                searchQuery = "",
                selectedFilter = HomeProductFilter.ALL,
                selectedSort = HomeProductSort.FEATURED
            )
        }
        selectCategory(null)
    }

    fun toggleFavorite(productId: Int) {
        viewModelScope.launch {
            customerLocalRepository.toggleFavoriteSynced(productId)
        }
    }

    fun saveAddress(address: CustomerAddress) {
        viewModelScope.launch {
            customerLocalRepository.saveAddressSynced(address)
        }
    }

    fun selectAddress(addressId: Long) {
        viewModelScope.launch {
            customerLocalRepository.selectAddressSynced(addressId)
        }
    }
}
