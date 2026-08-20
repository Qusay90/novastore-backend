package com.novastore.app.feature.home

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeErrorMessageContractTest {

    @Test
    fun `catalog failures expose customer-safe messages without transport details`() {
        val messages = listOf(
            CATALOG_LOAD_ERROR_MESSAGE,
            CATEGORY_LOAD_ERROR_MESSAGE,
            PRODUCTS_LOAD_ERROR_MESSAGE
        )

        messages.forEach { message ->
            assertTrue(message.isNotBlank())
            assertFalse(message.contains("HTTP", ignoreCase = true))
            assertFalse(message.contains("exception", ignoreCase = true))
            assertFalse(message.contains("10.0.2.2"))
            assertFalse(message.contains("5000"))
        }
    }
}
