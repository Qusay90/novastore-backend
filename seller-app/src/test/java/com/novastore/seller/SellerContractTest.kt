package com.novastore.seller

import com.novastore.seller.data.SellerTab
import com.novastore.seller.data.SellerScreen
import com.novastore.seller.data.SellerTeamMember
import com.novastore.seller.data.safeRows
import com.novastore.seller.data.strictLongOrNull
import com.novastore.seller.ui.activeTeamMemberCount
import com.novastore.seller.ui.dashboardBalanceSubtitle
import com.novastore.seller.ui.dashboardInventoryMetric
import com.novastore.seller.ui.dashboardPendingOrderLabel
import com.novastore.seller.ui.dashboardSalesLabel
import com.novastore.seller.ui.dashboardShowsTrend
import com.novastore.seller.ui.membershipStatusLabel
import com.novastore.seller.ui.verifiedTeamMemberBody
import com.novastore.seller.ui.verifiedTeamMemberSubtitle
import com.novastore.seller.ui.visibleTeamMembers
import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SellerContractTest {
    @Test
    fun `five canonical seller tabs remain present`() {
        assertEquals(listOf("Genel Bakış", "Ürünler", "Siparişler", "Finans", "Mağazam"), SellerTab.entries.map { it.title })
    }

    @Test
    fun `release build does not declare a mock seller provider`() {
        assertFalse(BuildConfig.SELLER_RELEASE_BUILD && BuildConfig.SELLER_API_BASE_URL.contains("mock", ignoreCase = true))
    }

    @Test
    fun `canonical QA state cannot become a production launch route`() {
        assertNull(canonicalHarnessStateForBuild(false, "team"))
        assertEquals("team", canonicalHarnessStateForBuild(true, "team"))
    }

    @Test
    fun `mutation UAT controls are impossible in a release build`() {
        assertFalse(mutationHarnessForBuild(false, true))
        assertFalse(mutationHarnessForBuild(false, false))
        assertTrue(mutationHarnessForBuild(true, true))
    }

    @Test
    fun `nested seller routes retain their authorized root scope`() {
        assertEquals(SellerScreen.DASHBOARD, SellerScreen.fromTab(SellerTab.DASHBOARD))
        assertEquals(SellerTab.PRODUCTS, SellerScreen.INVENTORY.tab)
        assertEquals(SellerTab.STORE, SellerScreen.SECURITY.tab)
        assertEquals(SellerTab.STORE, SellerScreen.TEAM.tab)
        assertEquals(SellerTab.DASHBOARD, SellerScreen.SUPPORT.tab)
    }

    @Test
    fun `API payload rendering keeps list structure and redacts sensitive fields`() {
        val listRows = JsonParser.parseString("""[{"id": 1, "customer_email": "buyer@example.test"}]""").safeRows()
        assertEquals(listOf("Kayıt 1" to "Mevcut"), listRows)

        val objectRows = JsonParser.parseString("""{"available_minor": 1200, "recipient_phone": "+905555555555"}""").safeRows()
        assertEquals(listOf("Available minor" to "1200"), objectRows)
        assertFalse(objectRows.joinToString().contains("+905555555555"))
    }

    @Test
    fun `finance minor units reject fractional and overflowing numbers`() {
        assertEquals(42L, JsonParser.parseString("42").strictLongOrNull())
        assertEquals(-42L, JsonParser.parseString("-42").strictLongOrNull())
        assertEquals(Long.MAX_VALUE, JsonParser.parseString("9223372036854775807").strictLongOrNull())
        assertEquals(Long.MIN_VALUE, JsonParser.parseString("-9223372036854775808").strictLongOrNull())
        assertNull(JsonParser.parseString("1.9").strictLongOrNull())
        assertNull(JsonParser.parseString("9223372036854775808").strictLongOrNull())
        assertNull(JsonParser.parseString("-9223372036854775809").strictLongOrNull())
        assertNull(JsonParser.parseString("1e100").strictLongOrNull())
    }

    @Test
    fun `live dashboard labels only fields supplied by the API contract`() {
        assertEquals(3 to "düşük stok", dashboardInventoryMetric(false, 3))
        assertEquals("Para birimi: TRY", dashboardBalanceSubtitle(false, "TRY"))
        assertFalse(dashboardShowsTrend(false))
        assertEquals("Brüt satış", dashboardSalesLabel(false))
        assertEquals("yeni veya hazırlanan sipariş", dashboardPendingOrderLabel(false))
        assertEquals(18 to "ürün", dashboardInventoryMetric(true, 3))
        assertEquals("Sonraki ödeme:  24 Temmuz", dashboardBalanceSubtitle(true, "TRY"))
        assertTrue(dashboardShowsTrend(true))
        assertEquals("Bugünkü satış", dashboardSalesLabel(true))
        assertEquals("yeni sipariş", dashboardPendingOrderLabel(true))
    }

    @Test
    fun `live team access review shows every member and denies unknown role claims`() {
        val members = listOf(
            SellerTeamMember(1, "Bir", "owner", "active"),
            SellerTeamMember(2, "İki", "manager", "active"),
            SellerTeamMember(3, "Üç", "operator", "suspended"),
            SellerTeamMember(4, "Dört", "future-role", "active")
        )

        assertEquals(4, visibleTeamMembers(members, fixture = false).size)
        assertEquals(3, visibleTeamMembers(members, fixture = true).size)
        assertEquals(3, activeTeamMemberCount(members))
        assertEquals("Rol kapsamı doğrulanamadı; izinler gösterilmedi.", verifiedTeamMemberBody("future-role"))
        assertEquals("Future-role • Etkin", verifiedTeamMemberSubtitle("future-role", "active", false))
        assertEquals("Operasyon • Askıya alındı", verifiedTeamMemberSubtitle("operator", "suspended", false))
        assertEquals("Erişimi kaldırıldı", membershipStatusLabel("revoked"))
        assertEquals("Süresi doldu", membershipStatusLabel("expired"))
        assertEquals("Durum doğrulanamadı", membershipStatusLabel("future-status"))
        assertEquals("Mağaza Sahibi", verifiedTeamMemberSubtitle("owner", "active", true))
    }
}
