package com.novastore.app.data.repository

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerScopedStateContractTest {
    @Test
    fun accountAddressKeysCannotCollide() {
        assertEquals("addresses", customerScopedPreferenceKey("addresses", null))
        assertEquals("addresses_7001", customerScopedPreferenceKey("addresses", 7001))
        assertEquals("addresses_7002", customerScopedPreferenceKey("addresses", 7002))
        assertFalse(
            customerScopedPreferenceKey("selected_address_id", 7001) ==
                customerScopedPreferenceKey("selected_address_id", 7002)
        )
        assertFalse(
            customerScopedPreferenceKey("addresses_migration_complete", 7001) ==
                customerScopedPreferenceKey("addresses_migration_complete", 7002)
        )
    }

    @Test
    fun delayedResultsAreAcceptedOnlyForTheSameUserAndGeneration() {
        assertTrue(isCurrentCustomerOwner(7001, 9, 7001, 9))
        assertFalse(isCurrentCustomerOwner(7001, 9, 7002, 10))
        assertFalse(isCurrentCustomerOwner(7001, 9, 7001, 10))
        assertFalse(isCurrentCustomerOwner(null, 9, 7001, 10))
    }

    @Test
    fun guestAddressKeysAreNeverTreatedAsCustomerOwnedKeys() {
        assertFalse(shouldPersistCustomerAddressState(null))
        assertTrue(shouldPersistCustomerAddressState(7001))
        assertEquals("addresses", customerScopedPreferenceKey("addresses", null))
        assertFalse(
            customerScopedPreferenceKey("addresses", null) ==
                customerScopedPreferenceKey("addresses", 7001)
        )
    }
}
