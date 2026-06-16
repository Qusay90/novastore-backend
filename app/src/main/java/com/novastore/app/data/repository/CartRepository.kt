package com.novastore.app.data.repository

import com.novastore.app.core.database.CartDao
import com.novastore.app.data.model.CartItem
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CartRepository @Inject constructor(
    private val cartDao: CartDao
) {
    val cartItems: Flow<List<CartItem>> = cartDao.getAllItems()

    suspend fun addToCart(item: CartItem): Result<Unit> = runCatching {
        val existing = cartDao.getItemById(item.productId)
        if (existing != null) {
            cartDao.updateQuantity(item.productId, existing.quantity + item.quantity)
        } else {
            cartDao.insertItem(item)
        }
    }

    suspend fun updateQuantity(productId: Int, quantity: Int): Result<Unit> = runCatching {
        if (quantity <= 0) {
            val existing = cartDao.getItemById(productId)
            if (existing != null) {
                cartDao.deleteItem(existing)
            }
        } else {
            cartDao.updateQuantity(productId, quantity)
        }
    }

    suspend fun removeFromCart(item: CartItem): Result<Unit> = runCatching {
        cartDao.deleteItem(item)
    }

    suspend fun clearCart(): Result<Unit> = runCatching {
        cartDao.clearCart()
    }
}
