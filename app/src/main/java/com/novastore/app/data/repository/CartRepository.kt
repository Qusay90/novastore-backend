package com.novastore.app.data.repository

import android.content.Context
import com.novastore.app.core.database.CartDao
import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.core.session.SessionGenerationSnapshot
import com.novastore.app.core.session.SessionManager
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.model.SharedCartPayload
import com.novastore.app.data.model.SharedCartStateRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
    private val cartMutationMutex = Mutex()
    val cartItems: Flow<List<CartItem>> = cartDao.getAllItems()

    suspend fun addToCart(item: CartItem): Result<Unit> =
        addToCartForOwner(item, sessionManager.captureSession())

    suspend fun addToCart(
        item: CartItem,
        expectedOwner: SessionGenerationSnapshot
    ): Result<Unit> = addToCartForOwner(item, expectedOwner)

    private suspend fun addToCartForOwner(
        item: CartItem,
        expectedOwner: SessionGenerationSnapshot?
    ): Result<Unit> = mutateCartForOwner(expectedOwner) {
        val existing = cartDao.getItemById(item.productId)
        if (existing != null) {
            cartDao.updateQuantity(item.productId, existing.quantity + item.quantity)
        } else {
            cartDao.insertItem(item)
        }
    }

    suspend fun updateQuantity(productId: Int, quantity: Int): Result<Unit> =
        mutateCartForOwner(sessionManager.captureSession()) {
        if (quantity <= 0) {
            val existing = cartDao.getItemById(productId)
            if (existing != null) {
                cartDao.deleteItem(existing)
            }
        } else {
            cartDao.updateQuantity(productId, quantity)
        }
    }

    suspend fun removeFromCart(item: CartItem): Result<Unit> =
        removeFromCartForOwner(item, sessionManager.captureSession())

    suspend fun removeFromCart(
        item: CartItem,
        expectedOwner: SessionGenerationSnapshot
    ): Result<Unit> = removeFromCartForOwner(item, expectedOwner)

    private suspend fun removeFromCartForOwner(
        item: CartItem,
        expectedOwner: SessionGenerationSnapshot?
    ): Result<Unit> = mutateCartForOwner(expectedOwner) {
        cartDao.deleteItem(item)
    }

    suspend fun clearCart(): Result<Unit> = mutateCartForOwner(sessionManager.captureSession()) {
        cartDao.clearCart()
    }

    private suspend fun mutateCartForOwner(
        owner: SessionGenerationSnapshot?,
        mutation: suspend () -> Unit
    ): Result<Unit> = runCatching {
        cartMutationMutex.withLock {
            checkOwnerCurrent(owner)
            prepareLocalCartForOwner(owner)
            val previous = cartItems.first().normalizedCartItems()
            checkOwnerCurrent(owner)
            try {
                mutation()
                checkOwnerCurrent(owner)
                if (owner != null) syncCartToServer(owner).getOrThrow()
                checkOwnerCurrent(owner)
                writeCartOwner(cartOwnerValue(owner))
            } catch (error: Throwable) {
                if (ownerIsCurrent(owner)) {
                    cartDao.replaceAll(previous)
                } else {
                    // Never leave the previous customer's local cart visible to a new session.
                    cartDao.clearCart()
                }
                throw error
            }
        }
    }

    suspend fun refreshCartFromServer(): Result<Unit> = runCatching {
        val owner = sessionManager.captureSession() ?: return@runCatching
        cartMutationMutex.withLock {
            val userId = requireOwnerUserId(owner)
            try {
                checkOwnerCurrent(owner)
                val response = api.getSharedCart(owner.generation)
                checkOwnerCurrent(owner)
                val remoteItems = response.payload.items.normalizedCartItems()
                val guestMigrationEligible = prepareLocalCartForOwner(owner)
                checkOwnerCurrent(owner)
                val localItems = cartItems.first().normalizedCartItems()
                checkOwnerCurrent(owner)

                if (response.exists) {
                    checkOwnerCurrent(owner)
                    cartDao.replaceAll(remoteItems)
                    checkOwnerCurrent(owner)
                    writeCartOwner(cartOwnerValue(owner))
                    markCartMigrationComplete(userId)
                    checkOwnerCurrent(owner)
                    return@withLock
                }

                if (guestMigrationEligible && localItems.isNotEmpty() && !isCartMigrationComplete(userId)) {
                    api.putSharedCart(
                        sessionGeneration = owner.generation,
                        body = SharedCartStateRequest(SharedCartPayload(items = localItems))
                    )
                    checkOwnerCurrent(owner)
                    writeCartOwner(cartOwnerValue(owner))
                    markCartMigrationComplete(userId)
                    checkOwnerCurrent(owner)
                } else {
                    checkOwnerCurrent(owner)
                    cartDao.replaceAll(emptyList())
                    checkOwnerCurrent(owner)
                    writeCartOwner(cartOwnerValue(owner))
                    markCartMigrationComplete(userId)
                    checkOwnerCurrent(owner)
                }
            } catch (error: Throwable) {
                if (!ownerIsCurrent(owner)) {
                    // A stale remote response must never remain visible under the next account.
                    cartDao.clearCart()
                    writeCartOwner(CART_OWNER_GUEST)
                    clearCartMigrationComplete(userId)
                }
                throw error
            }
        }
    }

    suspend fun clearAuthenticatedCartOnLogout(): Result<Unit> = runCatching {
        cartMutationMutex.withLock {
            if (readCartOwner() != CART_OWNER_GUEST) {
                cartDao.clearCart()
            }
            writeCartOwner(CART_OWNER_GUEST)
        }
    }

    suspend fun syncCartToServer(): Result<Unit> = runCatching {
        val owner = sessionManager.captureSession() ?: return@runCatching
        cartMutationMutex.withLock { syncCartToServer(owner).getOrThrow() }
    }

    private suspend fun syncCartToServer(owner: SessionGenerationSnapshot): Result<Unit> = runCatching {
        checkOwnerCurrent(owner)
        val items = cartItems.first().normalizedCartItems()
        checkOwnerCurrent(owner)
        api.putSharedCart(
            sessionGeneration = owner.generation,
            body = SharedCartStateRequest(SharedCartPayload(items = items))
        )
        checkOwnerCurrent(owner)
    }

    private fun ownerIsCurrent(owner: SessionGenerationSnapshot?): Boolean =
        owner?.let(sessionManager::isCurrent) ?: (sessionManager.captureSession() == null)

    private fun checkOwnerCurrent(owner: SessionGenerationSnapshot?) {
        check(ownerIsCurrent(owner)) { "Customer session changed during cart operation." }
    }

    private suspend fun prepareLocalCartForOwner(owner: SessionGenerationSnapshot?): Boolean {
        val expectedOwner = cartOwnerValue(owner)
        val recordedOwner = readCartOwner()
        val hasItems = cartItems.first().isNotEmpty()
        checkOwnerCurrent(owner)

        if (owner == null) {
            if (recordedOwner != CART_OWNER_GUEST && hasItems) cartDao.clearCart()
            writeCartOwner(CART_OWNER_GUEST)
            return false
        }

        val guestMigrationEligible = recordedOwner == CART_OWNER_GUEST
        val belongsToAnotherOwner = recordedOwner != null &&
            recordedOwner != CART_OWNER_GUEST &&
            recordedOwner != expectedOwner
        val provenanceUnknown = recordedOwner == null && hasItems
        if (belongsToAnotherOwner || provenanceUnknown) {
            cartDao.clearCart()
        }
        if (!guestMigrationEligible) writeCartOwner(expectedOwner)
        return guestMigrationEligible
    }

    private fun cartOwnerValue(owner: SessionGenerationSnapshot?): String =
        owner?.let { "$CART_OWNER_USER_PREFIX${requireOwnerUserId(it)}" } ?: CART_OWNER_GUEST

    private fun requireOwnerUserId(owner: SessionGenerationSnapshot): Int =
        requireNotNull(owner.userId?.takeIf { it > 0 }) { "Customer session owner is unavailable." }

    private fun readCartOwner(): String? = prefs.getString(KEY_CART_OWNER, null)

    private fun writeCartOwner(value: String) {
        prefs.edit().putString(KEY_CART_OWNER, value).apply()
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

    private fun clearCartMigrationComplete(userId: Int) {
        if (userId > 0) {
            prefs.edit().remove(cartMigrationKey(userId)).apply()
        }
    }

    companion object {
        private const val PREFS_NAME = "novastore_cart_sync_prefs"
        private const val KEY_CART_MIGRATION_COMPLETE = "cart_migration_complete"
        private const val KEY_CART_OWNER = "cart_owner"
        private const val CART_OWNER_GUEST = "guest"
        private const val CART_OWNER_USER_PREFIX = "user:"
    }
}
