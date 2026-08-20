package com.novastore.app.data.model

import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AccountOrderItemIdentityTest {
    @Test
    fun `explicit product id wins over legacy snapshot id`() {
        val item = orderItem(id = 91, productId = 201)

        assertEquals(201, item.resolvedProductId())
    }

    @Test
    fun `legacy order snapshot id remains a supported product id`() {
        val item = orderItem(id = 202, productId = null)

        assertEquals(202, item.resolvedProductId())
    }

    @Test
    fun `invalid or absent identifiers do not create a product route`() {
        assertNull(orderItem(id = 0, productId = -1).resolvedProductId())
        assertNull(orderItem(id = null, productId = null).resolvedProductId())
    }

    @Test
    fun `snake case backend product id deserializes as the typed route identity`() {
        val item = Gson().fromJson(
            """{"id":91,"product_id":201,"name":"NovaSound N1 Kulaklık"}""",
            AccountOrderItem::class.java
        )

        assertEquals(201, item.resolvedProductId())
    }

    private fun orderItem(id: Int?, productId: Int?) = AccountOrderItem(
        id = id,
        productId = productId,
        name = "NovaSound N1 Kulaklık",
        image = null,
        price = 1_299.0,
        quantity = 1,
        oldPrice = null,
        lineTotal = 1_299.0
    )
}
