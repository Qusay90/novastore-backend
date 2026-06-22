package com.novastore.app.data.repository

import android.content.Context
import com.novastore.app.core.database.CartDao
import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.core.session.SessionManager
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.model.SharedCartPayload
import com.novastore.app.data.model.SharedCartStateRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CartRepository @Inject constructor(
    @ApplicationContext context: Context,
    private val cartDao: CartDao,
    private val api: NovaStoreApi,
    private val sessionManager: SessionManager
) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val cartItems: Flow<List<CartItem>> = cartDao.getAllItems()

    suspend fun addToCart(item: CartItem): Result<Unit> = runCatching {
        val previous = cartItems.first().normalizedCartItems()
        val existing = cartDao.getItemById(item.productId)
        try {
            if (existing != null) {
                cartDao.updateQuantity(item.productId, existing.quantity + item.quantity)
            } else {
                cartDao.insertItem(item)
            }
            syncCartToServer().getOrThrow()
        } catch (error: Throwable) {
            cartDao.replaceAll(previous)
            throw error
        }
    }

    suspend fun updateQuantity(productId: Int, quantity: Int): Result<Unit> = runCatching {
        val previous = cartItems.first().normalizedCartItems()
        try {
            if (quantity <= 0) {
                val existing = cartDao.getItemById(productId)
                if (existing != null) {
                    cartDao.deleteItem(existing)
                }
            } else {
                cartDao.updateQuantity(productId, quantity)
            }
            syncCartToServer().getOrThrow()
        } catch (error: Throwable) {
            cartDao.replaceAll(previous)
            throw error
        }
    }

    suspend fun removeFromCart(item: CartItem): Result<Unit> = runCatching {
        val previous = cartItems.first().normalizedCartItems()
        try {
            cartDao.deleteItem(item)
            syncCartToServer().getOrThrow()
        } catch (error: Throwable) {
            cartDao.replaceAll(previous)
            throw error
        }
    }

    suspend fun clearCart(): Result<Unit> = runCatching {
        val previous = cartItems.first().normalizedCartItems()
        try {
            cartDao.clearCart()
            syncCartToServer().getOrThrow()
        } catch (error: Throwable) {
            cartDao.replaceAll(previous)
            throw error
        }
    }

    suspend fun refreshCartFromServer(): Result<Unit> = runCatching {
        if (!sessionManager.isLoggedIn) return@runCatching
        val response = api.getSharedCart()
        val remoteItems = response.payload.items.normalizedCartItems()
        val localItems = cartItems.first().normalizedCartItems()
        val userId = sessionManager.userId

        if (response.exists) {
            cartDao.replaceAll(remoteItems)
            markCartMigrationComplete(userId)
            return@runCatching
        }

        if (localItems.isNotEmpty() && !isCartMigrationComplete(userId)) {
            api.putSharedCart(SharedCartStateRequest(SharedCartPayload(items = localItems)))
            markCartMigrationComplete(userId)
        } else {
            cartDao.replaceAll(emptyList())
            markCartMigrationComplete(userId)
        }
    }

    suspend fun syncCartToServer(): Result<Unit> = runCatching {
        if (!sessionManager.isLoggedIn) return@runCatching
        val items = cartItems.first().normalizedCartItems()
        api.putSharedCart(SharedCartStateRequest(SharedCartPayload(items = items)))
    }

    private fun List<CartItem>.normalizedCartItems(): List<CartItem> {
        return asSequence()
            .filter { it.productId > 0 && it.quantity > 0 && it.name.isNotBlank() && it.price >= 0.0 }
            .groupBy { it.productId }
            .map { (_, items) ->
                val first = items.first()
                first.copy(quantity = items.sumOf { it.quantity }.coerceAtMost(999))
            }
            .toList()
    }

    private fun cartMigrationKey(userId: Int): String = "${KEY_CART_MIGRATION_COMPLETE}_$userId"

    private fun isCartMigrationComplete(userId: Int): Boolean =
        prefs.getBoolean(cartMigrationKey(userId), false)

    private fun markCartMigrationComplete(userId: Int) {
        if (userId > 0) {
            prefs.edit().putBoolean(cartMigrationKey(userId), true).apply()
        }
    }

    companion object {
        private const val PREFS_NAME = "novastore_cart_sync_prefs"
        private const val KEY_CART_MIGRATION_COMPLETE = "cart_migration_complete"
    }
}
