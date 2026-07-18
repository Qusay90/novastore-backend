package com.novastore.app.feature.home

import com.novastore.app.core.format.turkishPriceParts
import com.novastore.app.data.model.Product
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HomePriceRoundingTest {

    @Test
    fun legacyPlpExpressionReproducesKaracaOneKurusLoss() {
        val price = 849.90
        val priceWhole = price.toInt()
        val priceDecimal = ((price - priceWhole) * 100).toInt()
        val rendered = "$priceWhole,${priceDecimal.toString().padStart(2, '0')} TL"

        assertEquals("849,89 TL", rendered)
    }

    @Test
    fun karacaProductionFixturePreservesExactPlpPrice() {
        val karaca = Product(
            id = 38,
            name = "Karaca Çaydanlık",
            price = 849.90,
            oldPrice = null,
            stock = 1,
            description = null,
            imageUrl = null,
            category = "Çaydanlık",
            categories = listOf("Çaydanlık"),
            averageRating = "0",
            reviewCount = 0,
            media = emptyList(),
        )

        assertEquals("849,90 TL", turkishPriceParts(karaca.price)?.asText())
    }

    @Test
    fun formatsApprovedRegressionMatrixWithoutOneCentLoss() {
        val cases = mapOf(
            849.90 to "849,90 TL",
            1449.90 to "1.449,90 TL",
            12999.00 to "12.999,00 TL",
            899.90 to "899,90 TL",
            0.10 to "0,10 TL",
            0.29 to "0,29 TL",
            999.99 to "999,99 TL",
        )

        cases.forEach { (value, expected) ->
            assertEquals(expected, turkishPriceParts(value)?.asText())
        }
    }

    @Test
    fun rejectsNonFiniteAndNegativePricesWithoutThrowing() {
        assertNull(turkishPriceParts(Double.NaN))
        assertNull(turkishPriceParts(Double.POSITIVE_INFINITY))
        assertNull(turkishPriceParts(Double.NEGATIVE_INFINITY))
        assertNull(turkishPriceParts(-0.01))
    }
}
