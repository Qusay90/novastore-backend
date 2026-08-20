package com.novastore.app.core.design

import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerMotionTest {
    @Test
    fun reducedMotionIsAlwaysShorterThanStandardMotion() {
        assertSame(CustomerMotion.Standard, CustomerMotion.resolve(reduceMotion = false))
        assertSame(CustomerMotion.Reduced, CustomerMotion.resolve(reduceMotion = true))
        assertTrue(CustomerMotion.Reduced.quickMillis < CustomerMotion.Standard.quickMillis)
        assertTrue(CustomerMotion.Reduced.standardMillis < CustomerMotion.Standard.standardMillis)
        assertTrue(CustomerMotion.Reduced.emphasizedMillis < CustomerMotion.Standard.emphasizedMillis)
        assertTrue(CustomerMotion.Reduced.bubbleExitMillis < CustomerMotion.Standard.bubbleExitMillis)
        assertTrue(CustomerMotion.Reduced.bubbleEnterMillis < CustomerMotion.Standard.bubbleEnterMillis)
    }
}
