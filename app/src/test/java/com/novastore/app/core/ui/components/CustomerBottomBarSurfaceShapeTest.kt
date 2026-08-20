package com.novastore.app.core.ui.components

import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.Density
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class CustomerBottomBarSurfaceShapeTest {
    private val density = Density(density = 2.625f, fontScale = 1f)
    private val barWidthPx = 375f * density.density
    private val horizontalInsetPx = 8f * density.density
    private val surfaceOverflowPx = 6f * density.density
    private val surfaceSize = Size(
        width = 387f * density.density,
        height = 84f * density.density
    )
    private val homeCenterFraction = productionCenterFraction(
        selectedIndex = 0,
        selectedBubbleOffsetDp = -2.37f
    )
    private val accountCenterFraction = productionCenterFraction(
        selectedIndex = 5,
        selectedBubbleOffsetDp = 5f
    )

    @Test
    fun zeroProgressIsTheExactFlatBarAtEitherEdgeSelection() {
        val home = geometry(centerFraction = homeCenterFraction, progress = 0f)
        val account = geometry(centerFraction = accountCenterFraction, progress = 0f)
        val expectedTop = ((84f - 58.5f) / 2f) * density.density
        val expectedBottom = expectedTop + (58.5f * density.density)

        assertNull(home.bulgeBounds)
        assertNull(account.bulgeBounds)
        assertEquals(6f * density.density, home.baseBounds.left, 0.01f)
        assertEquals(expectedTop, home.baseBounds.top, 0.01f)
        assertEquals(surfaceSize.width - (6f * density.density), home.baseBounds.right, 0.01f)
        assertEquals(expectedBottom, home.baseBounds.bottom, 0.01f)
        assertEquals(home.baseBounds, account.baseBounds)
    }

    @Test
    fun settledBulgeIsTheSameUnclippedRadialCircleAtBothProductionCenters() {
        val home = geometry(centerFraction = homeCenterFraction, progress = 1f)
        val account = geometry(centerFraction = accountCenterFraction, progress = 1f)

        listOf(home, account).forEach { geometry ->
            val circle = requireNotNull(geometry.bulgeBounds)
            val upwardExpansion = geometry.baseBounds.top - circle.top
            val downwardExpansion = circle.bottom - geometry.baseBounds.bottom

            assertEquals(74f * density.density, circle.width, 0.01f)
            assertTrue(abs(circle.width - circle.height) <= 1f)
            assertEquals(geometry.baseBounds.center.y, circle.center.y, 0.01f)
            assertTrue(abs(upwardExpansion - downwardExpansion) <= 1f)
            assertTrue(circle.left >= 0f)
            assertTrue(circle.right <= surfaceSize.width)
            assertTrue(circle.top >= 0f)
            assertTrue(circle.bottom <= surfaceSize.height)
        }

        val homeCircle = requireNotNull(home.bulgeBounds)
        val accountCircle = requireNotNull(account.bulgeBounds)
        assertEquals(surfaceSize.width * homeCenterFraction, homeCircle.center.x, 0.01f)
        assertEquals(surfaceSize.width * accountCenterFraction, accountCircle.center.x, 0.01f)
        assertEquals(homeCircle.size, accountCircle.size)
        assertEquals(homeCircle.center.y, accountCircle.center.y, 0.01f)
    }

    @Test
    fun settledCenterUsesTheSameWeightedLayoutAsTheProductionRow() {
        val home = customerBottomBarSettledCenterX(
            selectedIndex = 0,
            itemCount = 6,
            barWidthPx = barWidthPx,
            horizontalInsetPx = horizontalInsetPx
        )
        val account = customerBottomBarSettledCenterX(
            selectedIndex = 5,
            itemCount = 6,
            barWidthPx = barWidthPx,
            horizontalInsetPx = horizontalInsetPx
        )

        assertEquals(42.7419f * density.density, home, 0.1f)
        assertEquals(332.2581f * density.density, account, 0.1f)
    }

    @Test
    fun progressOnlyInterpolatesTheRadiusAndNeverMovesTheCircleCenter() {
        val half = geometry(centerFraction = homeCenterFraction, progress = 0.5f)
        val settled = geometry(centerFraction = homeCenterFraction, progress = 1f)
        val halfCircle = requireNotNull(half.bulgeBounds)
        val settledCircle = requireNotNull(settled.bulgeBounds)

        assertTrue(abs(halfCircle.width - halfCircle.height) <= 1f)
        assertEquals(half.baseBounds.center.y, halfCircle.center.y, 0.01f)
        assertEquals(settledCircle.center, halfCircle.center)
        assertTrue(halfCircle.width < settledCircle.width)
    }

    private fun productionCenterFraction(
        selectedIndex: Int,
        selectedBubbleOffsetDp: Float
    ): Float {
        val centerInBar = customerBottomBarSettledCenterX(
            selectedIndex = selectedIndex,
            itemCount = 6,
            barWidthPx = barWidthPx,
            horizontalInsetPx = horizontalInsetPx
        ) + (selectedBubbleOffsetDp * density.density)
        return (centerInBar + surfaceOverflowPx) / surfaceSize.width
    }

    private fun geometry(
        centerFraction: Float,
        progress: Float
    ) = customerBottomBarSurfaceGeometry(
        size = surfaceSize,
        density = density,
        selectedCenterFraction = centerFraction,
        bulgeProgress = progress
    )
}
