package com.novastore.app.core.ui.components

import com.novastore.app.core.design.CustomerIconography
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class CustomerBottomDestinationsTest {

    @Test
    fun `production customer navigation uses the accepted six destination order`() {
        val destinations = customerBottomDestinations(cartCount = 3)

        assertEquals(
            listOf("home", "categories", "favorites", "cart", "support", "account"),
            destinations.map(CustomerBottomDestination::id)
        )
        assertEquals(listOf("Ana Sayfa", "Kategoriler", "Favoriler", "Sepetim", "Destek", "Hesabım"), destinations.map(CustomerBottomDestination::label))
        assertEquals(3, destinations.single { it.id == "cart" }.badgeCount)
    }

    @Test
    fun `every destination keeps explicit selected and unselected source assets`() {
        val destinations = customerBottomDestinations(cartCount = 0)

        destinations.forEach { destination ->
            assertNotEquals(0, destination.selectedIcon)
            assertNotEquals(0, destination.unselectedIcon)
        }
        assertEquals(CustomerIconography.HomeSelected, destinations.first().selectedIcon)
        assertEquals(CustomerIconography.Account, destinations.last().unselectedIcon)
    }
}
