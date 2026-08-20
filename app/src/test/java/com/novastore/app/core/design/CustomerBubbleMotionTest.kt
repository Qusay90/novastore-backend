package com.novastore.app.core.design

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerBubbleMotionTest {
    @Test
    fun standardTransitionKeepsTheApprovedSequentialDurations() {
        assertEquals(110, CustomerMotion.Standard.bubbleExitMillis)
        assertEquals(240, CustomerMotion.Standard.bubbleEnterMillis)
    }

    @Test
    fun transition_isSequentialAndReachesBothEndpoints() {
        val start = CustomerMotion.sampleBubbleTransition(0f)
        val exitFraction =
            CustomerMotion.Standard.bubbleExitMillis.toFloat() /
                (CustomerMotion.Standard.bubbleExitMillis + CustomerMotion.Standard.bubbleEnterMillis)
        val lastExit = CustomerMotion.sampleBubbleTransition(Math.nextDown(exitFraction))
        val firstEnter = CustomerMotion.sampleBubbleTransition(Math.nextUp(exitFraction))
        val end = CustomerMotion.sampleBubbleTransition(1f)

        assertEquals(CustomerBubbleMotionPhase.EXITING_OLD, start.phase)
        assertEquals(1f, start.scale, 0.0001f)
        assertEquals(1f, start.alpha, 0.0001f)

        assertEquals(CustomerBubbleMotionPhase.EXITING_OLD, lastExit.phase)
        assertEquals(0.82f, lastExit.scale, 0.0001f)
        assertEquals(0f, lastExit.alpha, 0.0001f)

        assertEquals(CustomerBubbleMotionPhase.ENTERING_NEW, firstEnter.phase)
        assertEquals(0.78f, firstEnter.scale, 0.0001f)
        assertEquals(0f, firstEnter.alpha, 0.0001f)

        assertEquals(CustomerBubbleMotionPhase.ENTERING_NEW, end.phase)
        assertEquals(1f, end.scale, 0.0001f)
        assertEquals(1f, end.alpha, 0.0001f)
    }

    @Test
    fun requestedProofFractionsRemainBounded() {
        listOf(0f, 0.10f, 0.25f, 0.40f, 0.50f, 0.60f, 0.75f, 0.90f, 1f)
            .map(CustomerMotion::sampleBubbleTransition)
            .forEach { frame ->
                assertTrue(frame.alpha in 0f..1f)
                assertTrue(frame.scale in 0.78f..1f)
            }
    }
}
