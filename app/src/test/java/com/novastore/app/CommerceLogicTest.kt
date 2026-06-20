package com.novastore.app

import com.novastore.app.data.model.CartItem
import com.novastore.app.data.model.FavoriteEntry
import com.novastore.app.data.model.FavoritesResponse
import com.novastore.app.data.model.Product
import org.junit.Assert.assertEquals
import org.junit.Test

class CommerceLogicTest {

    @Test
    fun testDiscountPercentageCalculation() {
        // Case 1: No discount (oldPrice is null)
        val p1 = Product(
            id = 1,
            name = "Test Phone",
            price = 1000.0,
            oldPrice = null,
            stock = 10,
            description = "Some description",
            imageUrl = "http://...",
            category = "Phones",
            categories = listOf("Phones"),
            averageRating = "4.5",
            reviewCount = 10,
            media = emptyList()
        )
        assertEquals(0, p1.discountPercentage)

        // Case 2: 20% discount
        val p2 = p1.copy(price = 800.0, oldPrice = 1000.0)
        assertEquals(20, p2.discountPercentage)

        // Case 3: oldPrice <= price (no discount / invalid old price)
        val p3 = p1.copy(price = 1200.0, oldPrice = 1000.0)
        assertEquals(0, p3.discountPercentage)
    }

    @Test
    fun testCartItemTotalCalculation() {
        val item1 = CartItem(
            productId = 1,
            name = "Laptop",
            price = 1500.0,
            imageUrl = "http://...",
            quantity = 2
        )
        val item2 = CartItem(
            productId = 2,
            name = "Mouse",
            price = 50.0,
            imageUrl = "http://...",
            quantity = 3
        )

        val cartList = listOf(item1, item2)
        val totalSum = cartList.sumOf { it.price * it.quantity }

        // 1500 * 2 + 50 * 3 = 3000 + 150 = 3150
        assertEquals(3150.0, totalSum, 0.001)
    }

    @Test
    fun testCategoryFiltering() {
        val products = listOf(
            Product(1, "Phone A", 1000.0, null, 5, null, null, "Phones", listOf("Phones"), "5", 0, emptyList()),
            Product(2, "Phone B", 800.0, null, 5, null, null, "Phones", listOf("Phones"), "5", 0, emptyList()),
            Product(3, "TV A", 2000.0, null, 2, null, null, "Electronics", listOf("Electronics"), "4", 0, emptyList())
        )

        val phones = products.filter { it.category == "Phones" }
        assertEquals(2, phones.size)
        assertEquals("Phone A", phones[0].name)
        assertEquals("Phone B", phones[1].name)

        val emptyFilter = products.filter { it.category == "NonExistent" }
        assertEquals(0, emptyFilter.size)
    }

    @Test
    fun testFavoritesResponseNormalizesProductIds() {
        val directIds = FavoritesResponse(productIds = listOf(3, 3, 1, 0))
        assertEquals(setOf(1, 3), directIds.normalizedProductIds)

        val entryIds = FavoritesResponse(
            favorites = listOf(
                FavoriteEntry(productId = 7),
                FavoriteEntry(productId = 7),
                FavoriteEntry(productId = -1)
            )
        )
        assertEquals(setOf(7), entryIds.normalizedProductIds)
    }
}
