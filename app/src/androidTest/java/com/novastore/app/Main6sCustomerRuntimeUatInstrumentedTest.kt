package com.novastore.app

import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.test.espresso.Espresso
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class Main6sCustomerRuntimeUatInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun pc1CustomerHandoffFlowsRenderAndNavigateOnTheRealEmulator() {
        click("Destek")
        awaitText("NovaBot")
        replaceTextAt(index = 0, value = "Siparişim nerede?")
        clickContentDescription("Gönder")
        awaitText("Hermetik NovaBot yanıtı", substring = true)

        click("Hesabım")
        awaitAnyText("Giriş Yap", "Nova Müşteri")
        if (!textExists("Nova Müşteri")) {
            replaceTextAt(index = 0, value = "fixture.customer@example.invalid")
            replaceTextAt(index = 1, value = "fixture-password")
            click("Giriş Yap", last = true)
        }
        awaitText("Nova Müşteri")
        clickContentDescription("Bildirimler")
        awaitText("Siparişin kargoya verildi.")

        click("Siparişin kargoya verildi.")
        awaitText("#1234502")
        awaitText("Harici takip bağlantısı doğrulanmış taşıyıcı sözleşmesi tamamlanana kadar kapalıdır.", substring = true)
        systemBack()
        awaitText("Siparişin kargoya verildi.")

        click("Ürün yeniden stokta.")
        awaitText("Nova Pulse ANC Kulaklık")
        systemBack()
        awaitText("Tümünü Okundu Yap")
        awaitText("Ürün sorun yanıtlandı.")

        click("Ürün sorun yanıtlandı.")
        awaitText("Sorularım")
        awaitText("Garanti süresi nedir?")
        awaitText("Yanıtlandı")
        systemBack()
        awaitText("Değerlendirmen yayınlandı.")

        click("Değerlendirmen yayınlandı.")
        awaitText("Ürün Değerlendirmelerim")
        awaitText("Yayında")
        awaitText("Yayın incelemesinde")
        awaitText("Yayından kaldırıldı")
        systemBack()
        awaitText("Destek kaydın temsilciye aktarıldı.")

        click("Destek kaydın temsilciye aktarıldı.")
        awaitText("Destek Taleplerim")
        awaitText("Destek kaydı #8801")
        systemBack()
        click("Eski kayıt artık bulunmuyor.", scroll = true)
        awaitText("İlgili kayıt bulunamadı veya artık erişilebilir değil.")
        awaitText("Bildirimler")
        systemBack()
        awaitText("Nova Müşteri")

        click("Kuponlarım")
        awaitText("NOVA150")
        awaitText("Kupon uygunluğu ve indirim tutarı ödeme adımında sunucu tarafından belirlenir.")
        systemBack()
        awaitText("Nova Müşteri")

        click("Siparişlerim")
        awaitText("#1234401")
        click("#1234401", scroll = true)
        awaitText("Teslim Edildi")
        click("Değerlendir", scroll = true)
        awaitText("NovaWatch 2 Akıllı Saat")
        awaitText("Puan: 5 / 5")
        awaitText("İncelemeye Gönder")
    }

    private fun awaitText(text: String, substring: Boolean = false) {
        val matcher = hasText(text, substring = substring)
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodes(matcher, useUnmergedTree = true)
                .fetchSemanticsNodes(atLeastOneRootRequired = false)
                .isNotEmpty()
        }
        composeRule.onAllNodes(matcher, useUnmergedTree = true)[0].assertIsDisplayed()
    }

    private fun click(text: String, scroll: Boolean = false, last: Boolean = false) {
        val matcher = hasText(text, substring = false) and hasClickAction()
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodes(matcher)
                .fetchSemanticsNodes(atLeastOneRootRequired = false)
                .isNotEmpty()
        }
        val nodes = composeRule.onAllNodes(matcher)
        val index = if (last) nodes.fetchSemanticsNodes().lastIndex else 0
        val node = nodes[index]
        if (scroll) node.performScrollTo()
        node.performClick()
    }

    private fun replaceTextAt(index: Int, value: String) {
        val matcher = hasSetTextAction()
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodes(matcher, useUnmergedTree = true)
                .fetchSemanticsNodes(atLeastOneRootRequired = false)
                .size > index
        }
        composeRule.onAllNodes(matcher, useUnmergedTree = true)[index].performTextReplacement(value)
    }

    private fun awaitAnyText(vararg values: String) {
        composeRule.waitUntil(timeoutMillis = 20_000) {
            values.any(::textExists)
        }
    }

    private fun textExists(value: String): Boolean =
        composeRule.onAllNodes(hasText(value, substring = false), useUnmergedTree = true)
            .fetchSemanticsNodes(atLeastOneRootRequired = false)
            .isNotEmpty()

    private fun clickContentDescription(description: String) {
        val matcher = SemanticsMatcher("content description contains $description") { node ->
            val property = androidx.compose.ui.semantics.SemanticsProperties.ContentDescription
            node.config.contains(property) && node.config[property].contains(description)
        }
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodes(matcher, useUnmergedTree = true)
                .fetchSemanticsNodes(atLeastOneRootRequired = false)
                .isNotEmpty()
        }
        composeRule.onAllNodes(matcher, useUnmergedTree = true)[0].performClick()
    }

    private fun systemBack() {
        Espresso.pressBack()
        composeRule.waitForIdle()
    }
}
