package com.novastore.app.qa

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CustomerComponentCatalogTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<QaScenarioActivity>()

    @Test
    fun componentCatalogExposesAllRequiredFoundationGroups() {
        composeRule.onNodeWithTag("qa_build_label").assertIsDisplayed()
        composeRule.onNodeWithTag("component_catalog").assertExists()
        composeRule.onNodeWithTag("component_top_bar").assertExists()
        composeRule.onNodeWithTag("component_bottom_bar").assertExists()
        composeRule.onNodeWithText("Hesabım").performClick()

        listOf(
            "component_text_field",
            "component_switch",
            "component_tabs",
            "component_otp",
            "component_timeline",
            "component_modal",
            "component_loading",
            "component_empty",
            "component_error",
            "component_offline"
        ).forEach { tag ->
            composeRule.onNodeWithTag("component_catalog").performScrollToNode(hasTestTag(tag))
            composeRule.onNodeWithTag(tag).assertExists()
        }
    }

    @Test
    fun scenarioSelectorReportsThe80By77Contract() {
        composeRule.onNodeWithText("80 Senaryo").performClick()
        composeRule.onNodeWithTag("scenario_selector").assertIsDisplayed()
        composeRule.onNodeWithText("80", substring = false).assertExists()
        composeRule.onNodeWithText("77", substring = false).assertExists()
        composeRule.onNodeWithText("PASS", substring = false).assertExists()
    }

    @Test
    fun interactiveModalOpensFromTheCatalogAndUsesTheSharedDialog() {
        composeRule.onNodeWithTag("component_catalog")
            .performScrollToNode(hasTestTag("component_modal_trigger"))
        composeRule.onNodeWithTag("component_modal_trigger").performClick()
        composeRule.onNodeWithTag("component_modal_dialog").assertIsDisplayed()
        composeRule.onNodeWithTag("component_modal_dialog_dismiss").performClick()
    }
}
