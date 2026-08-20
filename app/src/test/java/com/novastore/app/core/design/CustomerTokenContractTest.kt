package com.novastore.app.core.design

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerTokenContractTest {
    @Test
    fun sharedBarsUseTheMeasuredReferenceGeometry() {
        assertEquals(47.5.dp, CustomerDimensions.TopBarHeight)
        assertEquals(22.dp, CustomerDimensions.TopBarIcon)
        assertEquals(1.25.dp, CustomerDimensions.TopBarBackOffsetX)
        assertEquals((-0.55).dp, CustomerDimensions.TopBarBackOffsetY)
        assertEquals(70.dp, CustomerDimensions.BottomBarHeight)
        assertEquals(58.5.dp, CustomerDimensions.BottomBarBaseHeight)
        assertEquals(84.dp, CustomerDimensions.BottomBarSurfaceHeight)
        assertEquals(6.dp, CustomerDimensions.BottomBarSurfaceHorizontalOverflow)
        assertEquals(74.dp, CustomerDimensions.BottomBarSelectedSlot)
        assertEquals(58.dp, CustomerDimensions.BottomBarSelectedBubble)
        assertEquals(74.dp, CustomerDimensions.BottomBarSelectedBulgeDiameter)
        assertEquals(7.dp, CustomerDimensions.BottomBarSelectedBulgeBlendRadius)
        assertEquals(22.dp, CustomerDimensions.BottomBarIcon)
        assertEquals(22.dp, CustomerDimensions.BottomBarSelectedIcon)
        assertEquals(5.dp, CustomerDimensions.BottomBarUnselectedOffsetY)
        assertEquals(4.dp, CustomerDimensions.BottomBarUnselectedLabelGap)
        assertEquals(3.5.dp, CustomerDimensions.BottomBarSelectedContentOffsetY)
        assertEquals(4.dp, CustomerDimensions.BottomBarSelectedLabelGap)
        assertEquals(15.dp, CustomerDimensions.BottomBarBadgeSize)
        assertEquals(13.5.dp, CustomerDimensions.BottomBarBadgeOffsetX)
        assertEquals((-8.36).dp, CustomerDimensions.BottomBarBadgeOffsetY)
        assertEquals(24.dp, CustomerRadii.TopBar)
        assertTrue(CustomerDimensions.BottomBarSelectedSlot > CustomerDimensions.BottomBarSelectedBubble)
        assertTrue(
            CustomerDimensions.BottomBarSelectedBulgeDiameter >
                CustomerDimensions.BottomBarSelectedBubble
        )
        assertTrue(CustomerDimensions.BottomBarBaseHeight >= CustomerDimensions.BottomBarSelectedBubble)
    }

    @Test
    fun glassAndGlossOpacityRemainTranslucent() {
        listOf(
            CustomerOpacity.GlassTop,
            CustomerOpacity.GlassBottom,
            CustomerOpacity.GlassBackdropTint,
            CustomerOpacity.BubbleRim,
            CustomerOpacity.BubbleGloss
        ).forEach { opacity ->
            assertTrue(opacity > 0f)
            assertTrue(opacity < 1f)
        }
        assertTrue(CustomerOpacity.GlassTop > CustomerOpacity.GlassBottom)
    }
}
