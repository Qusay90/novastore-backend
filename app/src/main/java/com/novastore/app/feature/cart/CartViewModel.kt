package com.novastore.app.feature.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.repository.AuthRepository
import com.novastore.app.data.repository.CartRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@HiltViewModel
class CartViewModel @Inject constructor(
    private val cartRepository: CartRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    val cartItems: StateFlow<List<CartItem>> = cartRepository.cartItems
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    val cartCount: StateFlow<Int> = cartItems
        .map { items -> items.sumOf { it.quantity } }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = 0
        )

    val cartTotal: StateFlow<Double> = cartItems
        .map { items -> items.sumOf { it.price * it.quantity } }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = 0.0
        )

    init {
        viewModelScope.launch {
            cartRepository.refreshCartFromServer()
        }
        viewModelScope.launch {
            authRepository.isLoggedInFlow.collect { isLoggedIn ->
                if (isLoggedIn) {
                    cartRepository.refreshCartFromServer()
                }
            }
        }
    }

    fun addToCart(item: CartItem, onResult: (Boolean, String) -> Unit) {
        viewModelScope.launch {
            val result = cartRepository.addToCart(item)
            if (result.isSuccess) {
                Timber.d("Item added to cart via shared CartViewModel: ${item.name}")
                onResult(true, "${item.name} sepetinize eklendi.")
            } else {
                val errorMsg = result.exceptionOrNull()?.message ?: "Sepete eklenirken hata oluştu."
                Timber.e("Error adding to cart: $errorMsg")
                onResult(false, errorMsg)
            }
        }
    }

    fun updateQuantity(productId: Int, quantity: Int) {
        viewModelScope.launch {
            cartRepository.updateQuantity(productId, quantity)
        }
    }

    fun removeFromCart(item: CartItem) {
        viewModelScope.launch {
            cartRepository.removeFromCart(item)
        }
    }

    fun clearCart() {
        viewModelScope.launch {
            cartRepository.clearCart()
        }
    }
}
