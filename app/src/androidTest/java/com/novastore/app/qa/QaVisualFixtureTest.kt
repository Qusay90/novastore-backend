package com.novastore.app.qa

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.novastore.app.core.design.NovaCustomerTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import kotlin.math.abs

class QaVisualFixtureTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun controlledTopBarFixtureUsesTheSharedComponent() {
        composeRule.setContent {
            NovaCustomerTheme {
                QaVisualFixtureApp(
                    mode = QaVisualFixtureMode.TOP_BAR,
                    cartCount = 3
                )
            }
        }

        composeRule.onNodeWithTag("qa_visual_top_fixture").assertIsDisplayed()
        composeRule.onNodeWithTag("fixture_top_bar").assertIsDisplayed()
    }

    @Test
    fun controlledBottomBarFixtureUsesTheSharedComponentAndGlassGround() {
        composeRule.setContent {
            NovaCustomerTheme {
                QaVisualFixtureApp(
                    mode = QaVisualFixtureMode.BOTTOM_BAR,
                    cartCount = 3
                )
            }
        }

        composeRule.onNodeWithTag("qa_visual_bottom_fixture").assertIsDisplayed()
        composeRule.onNodeWithTag("fixture_glass_measurement_backdrop").assertIsDisplayed()
        composeRule.onNodeWithTag("fixture_bottom_bar").assertIsDisplayed()
    }

    @Test
    fun fidelityBottomBarFixtureUsesTheNormalizedSourceProductGround() {
        composeRule.setContent {
            NovaCustomerTheme {
                QaVisualFixtureApp(
                    mode = QaVisualFixtureMode.BOTTOM_BAR_FIDELITY,
                    cartCount = 3,
                    initialSelectedId = "account"
                )
            }
        }

        composeRule.onNodeWithTag("qa_visual_bottom_fixture").assertIsDisplayed()
        composeRule.onNodeWithTag("fixture_source_product_backdrop").assertIsDisplayed()
        composeRule.onNodeWithTag("fixture_bottom_bar").assertIsDisplayed()
        composeRule.onNodeWithTag("customer_bottom_item_account").assertIsSelected()
        composeRule.onNodeWithTag("customer_bottom_item_home").assertIsNotSelected()
        composeRule.onNodeWithTag("customer_bottom_selected_account", useUnmergedTree = true)
            .assertIsDisplayed()
        composeRule.onNodeWithTag("customer_bottom_selected_core_account", useUnmergedTree = true)
            .assertIsDisplayed()
        composeRule.onNodeWithTag("customer_bottom_surface", useUnmergedTree = true)
            .assertIsDisplayed()
        assertNoNode("customer_bottom_cradle_account")

        val accountBubble = composeRule
            .onNodeWithTag("customer_bottom_selected_core_account", useUnmergedTree = true)
            .fetchSemanticsNode()
            .boundsInRoot
        assertTrue(accountBubble.width > 0f)
        assertTrue(abs(accountBubble.width - accountBubble.height) <= 1f)
        val unifiedSurface = composeRule
            .onNodeWithTag("customer_bottom_surface", useUnmergedTree = true)
            .fetchSemanticsNode()
            .boundsInRoot
        assertTrue(unifiedSurface.width > accountBubble.width)
        assertTrue(abs(accountBubble.center.y - unifiedSurface.center.y) <= 1f)

        val cartIcon = composeRule
            .onNodeWithTag("customer_bottom_icon_cart", useUnmergedTree = true)
            .fetchSemanticsNode()
            .boundsInRoot
        val cartBadge = composeRule
            .onNodeWithTag("customer_bottom_badge_cart", useUnmergedTree = true)
            .fetchSemanticsNode()
            .boundsInRoot
        assertTrue(cartBadge.center.x > cartIcon.center.x)
        assertTrue(cartBadge.center.y < cartIcon.center.y)

        composeRule.onNodeWithTag("customer_bottom_item_home").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("customer_bottom_item_home").assertIsSelected()
        composeRule.onNodeWithTag("customer_bottom_item_account").assertIsNotSelected()
        composeRule.onNodeWithTag("customer_bottom_selected_home", useUnmergedTree = true)
            .assertIsDisplayed()
        composeRule.onNodeWithTag("customer_bottom_selected_core_home", useUnmergedTree = true)
            .assertIsDisplayed()
        assertNoNode("customer_bottom_selected_account")
        assertNoNode("customer_bottom_cradle_home")

        val homeBubble = composeRule
            .onNodeWithTag("customer_bottom_selected_core_home", useUnmergedTree = true)
            .fetchSemanticsNode()
            .boundsInRoot
        val homeSurface = composeRule
            .onNodeWithTag("customer_bottom_surface", useUnmergedTree = true)
            .fetchSemanticsNode()
            .boundsInRoot
        assertTrue(abs(homeBubble.width - homeBubble.height) <= 1f)
        assertTrue(abs(homeBubble.center.y - homeSurface.center.y) <= 1f)
    }

    @Test
    fun homeAlphaMaskFixtureUsesTheUnifiedProductionShape() {
        composeRule.setContent {
            NovaCustomerTheme {
                QaVisualFixtureApp(
                    mode = QaVisualFixtureMode.BOTTOM_BAR_ALPHA_MASK,
                    cartCount = 3,
                    initialSelectedId = "home"
                )
            }
        }

        composeRule.onNodeWithTag("qa_visual_bottom_alpha_mask_fixture")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("fixture_bottom_bar_alpha_mask")
            .assertIsDisplayed()
        assertNoNode("customer_bottom_selected_home")
    }

    @Test
    fun accountAlphaMaskFixtureUsesTheUnifiedProductionShape() {
        composeRule.setContent {
            NovaCustomerTheme {
                QaVisualFixtureApp(
                    mode = QaVisualFixtureMode.BOTTOM_BAR_ALPHA_MASK,
                    cartCount = 3,
                    initialSelectedId = "account"
                )
            }
        }

        composeRule.onNodeWithTag("qa_visual_bottom_alpha_mask_fixture")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("fixture_bottom_bar_alpha_mask")
            .assertIsDisplayed()
        assertNoNode("customer_bottom_selected_account")
    }

    @Test
    fun finalGlassNoCoreFixtureUsesTheProductionSurfacePainter() {
        composeRule.setContent {
            NovaCustomerTheme {
                QaVisualFixtureApp(
                    mode = QaVisualFixtureMode.BOTTOM_BAR_FINAL_GLASS_NO_CORE,
                    cartCount = 3,
                    initialSelectedId = "home"
                )
            }
        }

        composeRule.onNodeWithTag("qa_visual_bottom_final_glass_no_core_fixture")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("fixture_seam_inspection_backdrop")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("fixture_bottom_bar_final_glass_no_core")
            .assertIsDisplayed()
        assertNoNode("customer_bottom_selected_home")
    }

    @Test
    fun glassFillOnlyFixtureUsesTheProductionSurfacePainter() {
        composeRule.setContent {
            NovaCustomerTheme {
                QaVisualFixtureApp(
                    mode = QaVisualFixtureMode.BOTTOM_BAR_GLASS_FILL_ONLY,
                    cartCount = 3,
                    initialSelectedId = "account"
                )
            }
        }

        composeRule.onNodeWithTag("qa_visual_bottom_glass_fill_only_fixture")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("fixture_seam_inspection_backdrop")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("fixture_bottom_bar_glass_fill_only")
            .assertIsDisplayed()
        assertNoNode("customer_bottom_selected_account")
    }

    @Test
    fun outerStrokeOnlyFixtureUsesTheProductionSurfacePainter() {
        composeRule.setContent {
            NovaCustomerTheme {
                QaVisualFixtureApp(
                    mode = QaVisualFixtureMode.BOTTOM_BAR_OUTER_STROKE_ONLY,
                    cartCount = 3,
                    initialSelectedId = "account"
                )
            }
        }

        composeRule.onNodeWithTag("qa_visual_bottom_outer_stroke_only_fixture")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("fixture_bottom_bar_outer_stroke_only")
            .assertIsDisplayed()
        assertNoNode("customer_bottom_selected_account")
    }

    private fun assertNoNode(tag: String) {
        assertTrue(
            composeRule
                .onAllNodesWithTag(tag, useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isEmpty()
        )
    }
}
