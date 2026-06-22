package com.novastore.app.core.database

import androidx.room.*
import com.novastore.app.data.model.CartItem
import kotlinx.coroutines.flow.Flow

@Dao
interface CartDao {
    @Query("SELECT * FROM cart_items")
    fun getAllItems(): Flow<List<CartItem>>

    @Query("SELECT * FROM cart_items WHERE productId = :productId LIMIT 1")
    suspend fun getItemById(productId: Int): CartItem?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertItem(item: CartItem)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertItems(items: List<CartItem>)

    @Update
    suspend fun updateItem(item: CartItem)

    @Delete
    suspend fun deleteItem(item: CartItem)

    @Query("UPDATE cart_items SET quantity = :quantity WHERE productId = :productId")
    suspend fun updateQuantity(productId: Int, quantity: Int)

    @Query("DELETE FROM cart_items")
    suspend fun clearCart()

    @Transaction
    suspend fun replaceAll(items: List<CartItem>) {
        clearCart()
        if (items.isNotEmpty()) {
            insertItems(items)
        }
    }
}
