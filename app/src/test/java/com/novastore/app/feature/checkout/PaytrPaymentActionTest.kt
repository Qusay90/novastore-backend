package com.novastore.app.feature.checkout

import com.google.gson.Gson
import com.novastore.app.data.model.PaymentAction
import com.novastore.app.data.model.PaymentActionRedirect
import com.novastore.app.data.model.PaymentResponse
import com.novastore.app.data.model.PaymentStatusResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PaytrPaymentActionTest {

    private val gson = Gson()

    @Test
    fun clearsCartOnlyWhenPaymentIsPaidAndFinalized() {
        val missingStatus: PaymentStatusResponse? = null

        assertTrue(paymentStatus(paymentStatus = "PAID", finalized = true).shouldClearCartAfterStatusRefresh())
        assertTrue(paymentStatus(paymentStatus = "paid", finalized = true).shouldClearCartAfterStatusRefresh())

        assertFalse(paymentStatus(paymentStatus = "FAILED", finalized = true).shouldClearCartAfterStatusRefresh())
        assertFalse(paymentStatus(paymentStatus = "PENDING", finalized = true).shouldClearCartAfterStatusRefresh())
        assertFalse(paymentStatus(paymentStatus = "REQUIRES_ACTION", finalized = true).shouldClearCartAfterStatusRefresh())
        assertFalse(paymentStatus(paymentStatus = "WAITING", finalized = true).shouldClearCartAfterStatusRefresh())
        assertFalse(paymentStatus(paymentStatus = "UNKNOWN", finalized = true).shouldClearCartAfterStatusRefresh())
        assertFalse(paymentStatus(paymentStatus = "PAID", finalized = false).shouldClearCartAfterStatusRefresh())
        assertFalse(missingStatus.shouldClearCartAfterStatusRefresh())
    }

    @Test
    fun parsesPaytrIframePaymentActionResponse() {
        val json = """
            {
              "orderId": 101,
              "paymentRef": "NST-PAYTR-101-abc",
              "paymentStatus": "PENDING",
              "provider": "paytr",
              "idempotencyKey": "idem-101",
              "totals": { "subtotal": 120.5, "total": 120.5, "currency": "TRY" },
              "paymentAction": {
                "type": "iframe",
                "token": "fake-token",
                "iframeUrl": "https://www.paytr.com/odeme/guvenli/fake-token",
                "successUrl": "https://novastore.test/payment-result?status=success",
                "failUrl": "https://novastore.test/payment-result?status=fail"
              },
              "message": "Payment initialized"
            }
        """.trimIndent()

        val response = gson.fromJson(json, PaymentResponse::class.java)

        assertEquals("iframe", response.paymentAction?.type)
        assertEquals("fake-token", response.paymentAction?.token)
        assertEquals("https://www.paytr.com/odeme/guvenli/fake-token", response.paymentAction?.iframeUrl)
        assertEquals("https://novastore.test/payment-result?status=success", response.paymentAction?.successUrl)
        assertEquals("https://novastore.test/payment-result?status=fail", response.paymentAction?.failUrl)
    }

    @Test
    fun parsesLegacyNestedRedirectAndNullPaymentActionResponses() {
        val legacyJson = """
            {
              "orderId": 102,
              "paymentRef": "IYZ-102",
              "paymentStatus": "PENDING",
              "provider": "iyzico",
              "idempotencyKey": "idem-102",
              "totals": { "subtotal": 80.0, "total": 80.0, "currency": "TRY" },
              "paymentAction": {
                "provider": "iyzico",
                "status": "pending",
                "action": {
                  "type": "redirect",
                  "successUrl": "https://checkout.iyzico.test/success",
                  "failUrl": "https://checkout.iyzico.test/fail",
                  "message": "redirect"
                }
              },
              "message": "Payment initialized"
            }
        """.trimIndent()
        val nullActionJson = """
            {
              "orderId": 103,
              "paymentRef": null,
              "paymentStatus": "PENDING",
              "provider": "iyzico",
              "idempotencyKey": "idem-103",
              "totals": null,
              "paymentAction": null,
              "message": "Payment initialized"
            }
        """.trimIndent()

        val legacyResponse = gson.fromJson(legacyJson, PaymentResponse::class.java)
        val nullActionResponse = gson.fromJson(nullActionJson, PaymentResponse::class.java)

        assertEquals("iyzico", legacyResponse.paymentAction?.provider)
        assertEquals("redirect", legacyResponse.paymentAction?.action?.type)
        assertNull(legacyResponse.paymentAction?.type)
        assertNull(nullActionResponse.paymentAction)
    }

    @Test
    fun resolvesSafePaytrIframeUrlFromBackendUrl() {
        val action = PaymentAction(
            type = "iframe",
            token = "token-from-backend",
            iframeUrl = "https://www.paytr.com/odeme/guvenli/token-from-backend",
            successUrl = "https://novastore.test/payment-result?status=success",
            failUrl = "https://novastore.test/payment-result?status=fail"
        )

        assertTrue(action.isPaytrIframeAction())
        assertEquals(
            "https://www.paytr.com/odeme/guvenli/token-from-backend",
            action.resolveSafePaytrIframeUrl()
        )
    }

    @Test
    fun derivesSafePaytrIframeUrlFromTokenWhenIframeUrlMissing() {
        val action = PaymentAction(type = "iframe", token = "fake token+/")

        assertEquals(
            "https://www.paytr.com/odeme/guvenli/fake%20token%2B%2F",
            action.resolveSafePaytrIframeUrl()
        )
    }

    @Test
    fun rejectsUnsafePaytrIframeUrls() {
        assertFalse("http://www.paytr.com/odeme/guvenli/token".isSafePaytrIframeUrl())
        assertFalse("javascript:alert(1)".isSafePaytrIframeUrl())
        assertFalse("data:text/html;base64,abc".isSafePaytrIframeUrl())
        assertFalse("file:///tmp/paytr.html".isSafePaytrIframeUrl())
        assertFalse("https://evil.test/odeme/guvenli/token".isSafePaytrIframeUrl())
        assertFalse("https://www.paytr.com.evil.test/odeme/guvenli/token".isSafePaytrIframeUrl())
        assertFalse("https://www.paytr.com/odeme/guvenli/".isSafePaytrIframeUrl())
    }

    @Test
    fun rejectsInvalidDirectIframeUrlEvenWhenTokenExists() {
        val action = PaymentAction(
            type = "iframe",
            token = "fallback-token",
            iframeUrl = "http://www.paytr.com/odeme/guvenli/fallback-token"
        )

        assertNull(action.resolveSafePaytrIframeUrl())
    }

    @Test
    fun ignoresNullUnknownAndExistingNestedRedirectActionsForPaytrIframeResolution() {
        val missingAction: PaymentAction? = null
        val nestedRedirectAction = PaymentAction(
            provider = "iyzico",
            status = "pending",
            action = PaymentActionRedirect(
                type = "redirect",
                successUrl = "https://checkout.iyzico.test/success",
                failUrl = "https://checkout.iyzico.test/fail",
                message = "redirect"
            )
        )

        assertNull(missingAction.resolveSafePaytrIframeUrl())
        assertNull(PaymentAction(type = "redirect", iframeUrl = "https://www.paytr.com/odeme/guvenli/token").resolveSafePaytrIframeUrl())
        assertNull(nestedRedirectAction.resolveSafePaytrIframeUrl())
        assertFalse(nestedRedirectAction.isPaytrIframeAction())
    }

    private fun paymentStatus(paymentStatus: String, finalized: Boolean): PaymentStatusResponse =
        PaymentStatusResponse(
            orderId = 101,
            paymentRef = "NST-PAYTR-101-test",
            paymentStatus = paymentStatus,
            orderStatus = null,
            provider = "paytr",
            finalized = finalized,
            message = "status"
        )
}
