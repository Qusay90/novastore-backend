package com.novastore.app.feature.notifications

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.semantics.Role
import com.novastore.app.data.model.Notification
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class Main6sNotificationAccessibilityTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun typedNotificationCardExposesReadStateAndSingleAction() {
        var clicks = 0
        composeRule.setContent {
            NotificationCard(
                notification = Notification(
                    id = 1,
                    userId = 7001,
                    type = "order_update",
                    message = "Siparişin kargoya verildi.",
                    isRead = false,
                    createdAt = "2026-08-14T00:00:00Z",
                    entityType = "order",
                    entityId = 1234502
                ),
                onClick = { clicks += 1 }
            )
        }

        composeRule.onNode(hasText("Siparişin kargoya verildi.", substring = false), useUnmergedTree = true)
            .assertIsDisplayed()
        val card = composeRule.onNode(
            SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Okunmadı")
        )
        card
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .assertHasClickAction()
            .performClick()

        composeRule.runOnIdle { assertEquals(1, clicks) }
    }
}
