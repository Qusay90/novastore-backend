package com.novastore.seller

import android.content.Intent
import android.os.Bundle
import android.graphics.Rect
import android.os.ParcelFileDescriptor
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.novastore.seller.data.SellerCrossTenantMutationTargets
import com.novastore.seller.data.SellerSessionStore
import com.novastore.seller.data.SellerMutationUatTargets
import com.novastore.seller.ui.SellerMutationHarnessControl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SellerNavigationInstrumentationTest {
    @Test
    fun sellerPackageIsIsolatedFromCustomerApplication() {
        assertEquals("com.novastore.seller", InstrumentationRegistry.getInstrumentation().targetContext.packageName)
    }

    @Test
    fun sellerLoginActivityLaunchesInTheIsolatedPackage() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val activity = instrumentation.startActivitySync(
            Intent(context, SellerMainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        try {
            assertEquals("com.novastore.seller", activity.packageName)
            assertNotNull(activity.window.decorView)
        } finally {
            SellerSessionStore(context).clear()
            activity.finish()
        }
    }

    @Test
    fun noSessionLaunchesTheSellerLoginRouteWithoutAnIntermediateDashboard() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        SellerMutationHarnessControl.enabled = true
        SellerSessionStore(context).clear()
        val activity = instrumentation.startActivitySync(
            Intent(context, SellerMainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        try {
            assertNotNull(waitForDescriptionPrefix(instrumentation, "seller-route:seller://auth/login"))
            assertTrue(findDescriptionPrefix(instrumentation.uiAutomation.rootInActiveWindow, "seller-route:seller://dashboard") == null)
        } finally {
            SellerMutationHarnessControl.enabled = false
            SellerSessionStore(context).clear()
            activity.finish()
        }
    }

    @Test
    fun realSellerApiLoginAndLaunchScreensUseTheAndroidHttpPath() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        assumeTrue(
            "Real seller API E2E requires the explicit instrumentation opt-in.",
            InstrumentationRegistry.getArguments().getString("sellerRealApiE2e") == "true"
        )
        val preserveSessionForOrchestratedColdLaunch =
            InstrumentationRegistry.getArguments().getString("preserveSellerSessionAfterE2e") == "true"
        val context = instrumentation.targetContext
        SellerSessionStore(context).clear()
        val activity = instrumentation.startActivitySync(
            Intent(context, SellerMainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        )
        try {
            assertNotNull(waitForDescriptionPrefix(instrumentation, "seller-route:seller://auth/login"))
            setText(instrumentation, "E-posta veya telefon numarası", "owner@wave4.local.test")
            setText(instrumentation, "Şifre", "SellerLocal2026")
            shell(instrumentation, "input keyevent 4")
            Thread.sleep(250)
            clickDescriptionWithScroll(instrumentation, "Giriş Yap")
            assertRoute(instrumentation, "seller://dashboard")

            tapBottomTab(instrumentation, 2)
            assertRoute(instrumentation, "seller://offers")
            clickDescriptionWithScroll(instrumentation, "Stok durumunu görüntüle")
            assertRoute(instrumentation, "seller://inventory")

            tapBottomTab(instrumentation, 3)
            assertRoute(instrumentation, "seller://orders")
            tapBottomTab(instrumentation, 4)
            assertRoute(instrumentation, "seller://finance")
            tapBottomTab(instrumentation, 5)
            assertRoute(instrumentation, "seller://store")

            clickDescriptionWithScroll(instrumentation, "Mağaza bağlamını görüntüle")
            assertRoute(instrumentation, "seller://context")

            tapBottomTab(instrumentation, 5)
            assertRoute(instrumentation, "seller://store")
            clickDescriptionWithScroll(instrumentation, "Ekip ve yetkileri görüntüle")
            assertRoute(instrumentation, "seller://team")
            assertNotNull(waitForText(instrumentation, "3 etkin üye"))
            assertTextWithScroll(instrumentation, "Wave 4 Sahibi")
            assertTextWithScroll(instrumentation, "Sahip")
            assertTextWithScroll(instrumentation, "Yönetici")
            assertTextWithScroll(instrumentation, "Operasyon")

            tapBottomTab(instrumentation, 5)
            assertRoute(instrumentation, "seller://store")
            resetScrollToTop(instrumentation)
            clickDescriptionWithScroll(instrumentation, "Hesap ve güvenliği görüntüle")
            assertRoute(instrumentation, "seller://settings/security")

            tapBottomTab(instrumentation, 5)
            assertRoute(instrumentation, "seller://store")
            resetScrollToTop(instrumentation)
            clickDescriptionWithScroll(instrumentation, "Satıcı desteğini görüntüle")
            assertRoute(instrumentation, "seller://support")
        } finally {
            if (!preserveSessionForOrchestratedColdLaunch) SellerSessionStore(context).clear()
            activity.finish()
        }
    }

    @Test
    fun realSellerMutationAndConflictPathsUseOnlyTheAndroidUi() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        assumeTrue(
            "Mutation E2E requires the explicit local-only instrumentation opt-in.",
            InstrumentationRegistry.getArguments().getString("sellerMutationE2e") == "true"
        )
        val context = instrumentation.targetContext
        val arguments = InstrumentationRegistry.getArguments()
        val crossTenantValues = listOf(
            "sellerCrossTenantStoreId",
            "sellerCrossTenantStoreRevision",
            "sellerCrossTenantOfferId",
            "sellerCrossTenantOfferRevision",
            "sellerCrossTenantInventoryItemId",
            "sellerCrossTenantInventoryRevision",
            "sellerCrossTenantOrderId",
            "sellerCrossTenantOrderRevision",
            "sellerCrossTenantOrderPackageId",
            "sellerCrossTenantConversationId",
            "sellerCrossTenantConversationRevision"
        ).associateWith { arguments.getString(it)?.toLongOrNull() }
        assumeTrue(
            "Mutation E2E requires the complete runner-provided synthetic foreign-store matrix.",
            crossTenantValues.values.all { it != null && it > 0 }
        )
        SellerMutationUatTargets.crossTenant = SellerCrossTenantMutationTargets(
            storeId = crossTenantValues.getValue("sellerCrossTenantStoreId")!!,
            storeRevision = crossTenantValues.getValue("sellerCrossTenantStoreRevision")!!,
            offerId = crossTenantValues.getValue("sellerCrossTenantOfferId")!!,
            offerRevision = crossTenantValues.getValue("sellerCrossTenantOfferRevision")!!,
            inventoryItemId = crossTenantValues.getValue("sellerCrossTenantInventoryItemId")!!,
            inventoryRevision = crossTenantValues.getValue("sellerCrossTenantInventoryRevision")!!,
            orderId = crossTenantValues.getValue("sellerCrossTenantOrderId")!!,
            orderRevision = crossTenantValues.getValue("sellerCrossTenantOrderRevision")!!,
            orderPackageId = crossTenantValues.getValue("sellerCrossTenantOrderPackageId")!!,
            conversationId = crossTenantValues.getValue("sellerCrossTenantConversationId")!!,
            conversationRevision = crossTenantValues.getValue("sellerCrossTenantConversationRevision")!!
        )
        SellerMutationHarnessControl.enabled = true
        SellerSessionStore(context).clear()
        val activity = instrumentation.startActivitySync(
            Intent(context, SellerMainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        )
        try {
            setText(instrumentation, "E-posta veya telefon numarası", "owner@wave4.local.test")
            setText(instrumentation, "Şifre", "SellerLocal2026")
            shell(instrumentation, "input keyevent 4")
            Thread.sleep(250)
            clickDescriptionWithScroll(instrumentation, "Giriş Yap")
            assertRoute(instrumentation, "seller://dashboard")

            tapBottomTab(instrumentation, 5)
            assertRoute(instrumentation, "seller://store")
            runMutation(instrumentation, "STORE_UPDATE")
            runMutation(instrumentation, "STORE_PROTECTED_FIELD_DENIAL")
            runMutation(instrumentation, "STORE_CROSS_TENANT_DENIAL")

            tapBottomTab(instrumentation, 2)
            assertRoute(instrumentation, "seller://offers")
            runMutation(instrumentation, "OFFER_UPDATE")
            runMutation(instrumentation, "OFFER_PROTECTED_FIELD_DENIAL")
            runMutation(instrumentation, "OFFER_CROSS_TENANT_DENIAL")
            clickDescriptionWithScroll(instrumentation, "Stok durumunu görüntüle")
            assertRoute(instrumentation, "seller://inventory")
            runMutation(instrumentation, "INVENTORY_UPDATE")
            runMutation(instrumentation, "INVENTORY_NEGATIVE_DENIAL")
            runMutation(instrumentation, "INVENTORY_STALE_CONFLICT")
            runMutation(instrumentation, "INVENTORY_CONCURRENT_CONFLICT")
            runMutation(instrumentation, "INVENTORY_CROSS_TENANT_DENIAL")

            tapBottomTab(instrumentation, 3)
            assertRoute(instrumentation, "seller://orders")
            runMutation(instrumentation, "ORDER_ALLOWED_TRANSITION")
            runMutation(instrumentation, "ORDER_INVALID_TRANSITION")
            runMutation(instrumentation, "ORDER_STALE_CONFLICT")
            runMutation(instrumentation, "ORDER_CROSS_TENANT_DENIAL")

            SellerMutationHarnessControl.enabled = false
            tapBottomTab(instrumentation, 5)
            assertRoute(instrumentation, "seller://store")
            resetScrollToTop(instrumentation)
            SellerMutationHarnessControl.enabled = true
            clickDescriptionWithScroll(instrumentation, "Satıcı desteğini görüntüle")
            assertRoute(instrumentation, "seller://support")
            runMutation(instrumentation, "SUPPORT_CREATE_AND_SEND")
            runMutation(instrumentation, "SUPPORT_IDEMPOTENT_RETRY")
            runMutation(instrumentation, "SUPPORT_CROSS_TENANT_DENIAL")

            // The debug mutation panel has completed its purpose. Hide it before exercising the
            // normal seller-owned store -> security -> logout-all UI so the proof does not depend
            // on test-only layout space or a test-only session action.
            SellerMutationHarnessControl.enabled = false
            tapBottomTab(instrumentation, 5)
            assertRoute(instrumentation, "seller://store")
            resetScrollToTop(instrumentation)
            clickDescriptionWithScroll(instrumentation, "Hesap ve güvenliği görüntüle")
            assertRoute(instrumentation, "seller://settings/security")
            clickDescriptionWithScroll(instrumentation, "Tüm cihazlardaki oturumları kapat")
            assertNotNull(waitForDescriptionPrefix(instrumentation, "seller-route:seller://auth/login"))
        } finally {
            SellerMutationUatTargets.crossTenant = null
            SellerMutationHarnessControl.enabled = false
            SellerSessionStore(context).clear()
            activity.finish()
        }
    }
}

private fun runMutation(instrumentation: android.app.Instrumentation, action: String) {
    clickDescription(instrumentation, "seller-mutation:$action")
    assertNotNull(
        "Mutation did not pass through the Android UI: $action",
        waitForDescriptionContains(instrumentation, "seller-mutation-result:$action:PASS:")
    )
}

private fun tapBottomTab(instrumentation: android.app.Instrumentation, oneBasedIndex: Int) {
    require(oneBasedIndex in 1..5)
    val keys = listOf("dashboard", "products", "orders", "finance", "store")
    clickViewId(instrumentation, "seller-tab:${keys[oneBasedIndex - 1]}")
}

private fun clickDescriptionWithScroll(
    instrumentation: android.app.Instrumentation,
    description: String
) {
    repeat(10) {
        findDescription(instrumentation.uiAutomation.rootInActiveWindow) { it == description }?.let { node ->
            clickNode(instrumentation, node, description)
            return
        }
        shell(instrumentation, "input swipe 540 1750 540 620 350")
        Thread.sleep(350)
    }
    throw AssertionError("Could not reach $description through the Android UI")
}

private fun resetScrollToTop(instrumentation: android.app.Instrumentation) {
    repeat(8) {
        shell(instrumentation, "input swipe 540 620 540 1750 250")
        Thread.sleep(125)
    }
}

private fun assertTextWithScroll(
    instrumentation: android.app.Instrumentation,
    value: String
) {
    repeat(10) {
        findNode(instrumentation.uiAutomation.rootInActiveWindow) { node ->
            node.text?.toString()?.contains(value) == true
        }?.let { return }
        shell(instrumentation, "input swipe 540 1750 540 620 350")
        Thread.sleep(350)
    }
    throw AssertionError("Could not reach text $value through the Android UI")
}

private fun shell(instrumentation: android.app.Instrumentation, command: String): String =
    instrumentation.uiAutomation.executeShellCommand(command).use { descriptor ->
        ParcelFileDescriptor.AutoCloseInputStream(descriptor).use { input ->
            input.readBytes().decodeToString()
        }
    }

private fun assertRoute(instrumentation: android.app.Instrumentation, route: String) {
    val found = waitForDescriptionPrefix(instrumentation, "seller-route:$route seller-runtime-source:api")
    if (found == null) {
        val actual = findDescriptionPrefix(
            instrumentation.uiAutomation.rootInActiveWindow,
            "seller-route:"
        )?.contentDescription?.toString()
        throw AssertionError("Expected route $route; actual=$actual")
    }
}

private fun setText(instrumentation: android.app.Instrumentation, description: String, value: String) {
    val descriptionNode = requireNotNull(waitForExactDescription(instrumentation, description))
    val descriptionBounds = Rect().also(descriptionNode::getBoundsInScreen)
    val editable = requireNotNull(waitForNode(instrumentation) { candidate ->
        if (!candidate.isEditable && candidate.actionList.none { it.id == AccessibilityNodeInfo.ACTION_SET_TEXT }) {
            false
        } else {
            val candidateBounds = Rect().also(candidate::getBoundsInScreen)
            Rect.intersects(descriptionBounds, candidateBounds)
        }
    }) { "Could not find editable field for $description" }
    val arguments = Bundle().apply {
        putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
    }
    editable.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
    val setByAccessibilityAction = editable.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
    if (!setByAccessibilityAction) {
        val bounds = Rect().also(editable::getBoundsInScreen)
        val descriptor = instrumentation.uiAutomation.executeShellCommand(
            "input tap ${bounds.centerX()} ${bounds.centerY()}"
        )
        descriptor.close()
        Thread.sleep(250)
        val inputDescriptor = instrumentation.uiAutomation.executeShellCommand("input text $value")
        inputDescriptor.close()
    }
    if (editable.isPassword && setByAccessibilityAction) {
        // Secure fields may intentionally redact their text from the accessibility snapshot.
        Thread.sleep(150)
        return
    }
    assertTrue(
        "Could not set $description",
        waitForNode(instrumentation) { candidate ->
            candidate.text?.toString()?.contains(value) == true ||
                (candidate.isPassword && candidate.text?.length == value.length)
        } != null
    )
}

private fun clickViewId(instrumentation: android.app.Instrumentation, viewIdSuffix: String) {
    val node = requireNotNull(waitForNode(instrumentation) { candidate ->
        candidate.viewIdResourceName?.endsWith(viewIdSuffix) == true
    })
    clickNode(instrumentation, node, viewIdSuffix)
}

private fun clickDescription(instrumentation: android.app.Instrumentation, description: String) {
    val node = requireNotNull(waitForExactDescription(instrumentation, description))
    clickNode(instrumentation, node, description)
}

private fun clickDescriptionPrefix(instrumentation: android.app.Instrumentation, prefix: String) {
    val node = requireNotNull(waitForDescriptionPrefix(instrumentation, prefix))
    clickNode(instrumentation, node, prefix)
}

private fun clickNode(
    instrumentation: android.app.Instrumentation,
    node: AccessibilityNodeInfo,
    label: String
) {
    val clickable = findClickableNode(node) ?: node
    if (clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return
    val bounds = Rect().also(clickable::getBoundsInScreen)
    val descriptor = instrumentation.uiAutomation.executeShellCommand(
        "input tap ${bounds.centerX()} ${bounds.centerY()}"
    )
    descriptor.close()
    assertTrue("Could not click $label", bounds.width() > 0 && bounds.height() > 0)
}

private fun findClickableNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
    if (node == null) return null
    if (node.isClickable) return node
    for (index in 0 until node.childCount) {
        findClickableNode(node.getChild(index))?.let { return it }
    }
    var parent = node.parent
    while (parent != null) {
        if (parent.isClickable) return parent
        parent = parent.parent
    }
    return null
}

private fun waitForExactDescription(
    instrumentation: android.app.Instrumentation,
    description: String
): AccessibilityNodeInfo? {
    repeat(120) {
        instrumentation.uiAutomation.clearCache()
        findDescription(instrumentation.uiAutomation.rootInActiveWindow) { it == description }?.let { return it }
        Thread.sleep(100)
    }
    return null
}

private fun waitForText(
    instrumentation: android.app.Instrumentation,
    text: String
): AccessibilityNodeInfo? {
    repeat(120) {
        findNode(instrumentation.uiAutomation.rootInActiveWindow) { it.text?.toString() == text }?.let { return it }
        Thread.sleep(100)
    }
    return null
}

private fun waitForNode(
    instrumentation: android.app.Instrumentation,
    predicate: (AccessibilityNodeInfo) -> Boolean
): AccessibilityNodeInfo? {
    repeat(40) {
        findNode(instrumentation.uiAutomation.rootInActiveWindow, predicate)?.let { return it }
        Thread.sleep(100)
    }
    return null
}

private fun waitForDescriptionPrefix(
    instrumentation: android.app.Instrumentation,
    prefix: String
): AccessibilityNodeInfo? {
    repeat(30) {
        findDescriptionPrefix(instrumentation.uiAutomation.rootInActiveWindow, prefix)?.let { return it }
        Thread.sleep(100)
    }
    return null
}

private fun waitForDescriptionContains(
    instrumentation: android.app.Instrumentation,
    value: String
): AccessibilityNodeInfo? {
    repeat(200) {
        instrumentation.uiAutomation.clearCache()
        findNode(instrumentation.uiAutomation.rootInActiveWindow) { node ->
            node.contentDescription?.toString()?.contains(value) == true
        }?.let { return it }
        Thread.sleep(100)
    }
    return null
}

private fun findDescriptionPrefix(
    node: AccessibilityNodeInfo?,
    prefix: String
): AccessibilityNodeInfo? {
    if (node?.contentDescription?.toString()?.startsWith(prefix) == true) return node
    if (node == null) return null
    for (index in 0 until node.childCount) {
        findDescriptionPrefix(node.getChild(index), prefix)?.let { return it }
    }
    return null
}

private fun findDescription(
    node: AccessibilityNodeInfo?,
    predicate: (String) -> Boolean
): AccessibilityNodeInfo? {
    if (node == null) return null
    node.contentDescription?.toString()?.let { if (predicate(it)) return node }
    for (index in 0 until node.childCount) {
        findDescription(node.getChild(index), predicate)?.let { return it }
    }
    return null
}

private fun findNode(
    node: AccessibilityNodeInfo?,
    predicate: (AccessibilityNodeInfo) -> Boolean
): AccessibilityNodeInfo? {
    if (node == null) return null
    if (predicate(node)) return node
    for (index in 0 until node.childCount) {
        findNode(node.getChild(index), predicate)?.let { return it }
    }
    return null
}
