package com.novastore.app.navigation

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerBottomNavigationVisibilityTest {
    @Test
    fun `customer tab roots keep the shared bottom navigation`() {
        listOf(
            Screen.Home,
            Screen.Categories,
            Screen.Favorites,
            Screen.Cart,
            Screen.Support,
            Screen.Account
        ).forEach { screen -> assertTrue(screen.showsCustomerBottomNavigation()) }
    }

    @Test
    fun `detail checkout and notification surfaces own the full viewport`() {
        listOf(
            Screen.ProductDetail(productId = 101),
            Screen.Checkout(),
            Screen.Notifications
        ).forEach { screen -> assertFalse(screen.showsCustomerBottomNavigation()) }
    }
}
