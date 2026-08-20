package com.novastore.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.novastore.app.data.model.AccountCoupon
import com.novastore.app.data.model.AccountMessage
import com.novastore.app.data.model.AssistantChatResponse
import com.novastore.app.data.model.CustomerNotificationTarget
import com.novastore.app.data.model.Notification
import com.novastore.app.data.model.Product
import com.novastore.app.data.model.UserReview
import com.novastore.app.data.model.customerTargetOrNull
import com.novastore.app.data.model.orderedImageUrls
import java.net.HttpURLConnection
import java.net.URL
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class Main6sHermeticFixtureContractInstrumentedTest {
    private val gson = Gson()
    private val origin = "http://10.0.2.2:5000"
    private val token = "fixture.debug.token.not-a-credential"

    @Test
    fun pc1CompatibleHermeticContractAndOwnershipResponsesPassOnEmulator() {
        val notificationResponse = get("/api/notifications/user/7001", authenticated = true)
        val notifications: List<Notification> = gson.fromJson(
            notificationResponse.body,
            object : TypeToken<List<Notification>>() {}.type
        )
        val targets = notifications.mapNotNull(Notification::customerTargetOrNull)
        assertEquals(200, notificationResponse.status)
        assertTrue(targets.any { it is CustomerNotificationTarget.Order })
        assertTrue(targets.any { it is CustomerNotificationTarget.Product })
        assertTrue(targets.any { it is CustomerNotificationTarget.ProductQuestion })
        assertTrue(targets.any { it is CustomerNotificationTarget.ReturnRequest })
        assertTrue(targets.any { it is CustomerNotificationTarget.Review })
        assertTrue(targets.any { it is CustomerNotificationTarget.SupportThread })

        assertEquals(401, get("/api/notifications/user/7001", authenticated = false).status)
        assertEquals(403, get("/api/notifications/user/7002", authenticated = true).status)
        assertEquals(404, get("/api/returns/999999", authenticated = true).status)

        val reviews: List<UserReview> = gson.fromJson(
            get("/api/reviews/user/7001", true).body,
            object : TypeToken<List<UserReview>>() {}.type
        )
        assertEquals(setOf("PENDING", "PUBLISHED", "HIDDEN"), reviews.mapNotNull { it.status }.toSet())

        val product = gson.fromJson(get("/api/products/201", false).body, Product::class.java)
        assertTrue(product.media.all { it.mediaType == "image" })
        assertTrue(product.orderedImageUrls().isNotEmpty())

        val messages: List<AccountMessage> = gson.fromJson(
            get("/api/messages/history/7001", true).body,
            object : TypeToken<List<AccountMessage>>() {}.type
        )
        assertTrue(messages.all { it.supportThreadId == 8801L })

        val coupons: List<AccountCoupon> = gson.fromJson(
            get("/api/campaigns/coupons/active", true).body,
            object : TypeToken<List<AccountCoupon>>() {}.type
        )
        assertEquals("NOVA150", coupons.single().code)

        val returnWrite = post("/api/returns", authenticated = true, body = """{"order_id":1234401}""")
        assertEquals(503, returnWrite.status)
        assertTrue(returnWrite.body.contains("\"code\":\"RETURN_WRITES_DISABLED\""))

        val guestAssistant = post(
            "/api/assistant/chat",
            authenticated = false,
            body = """{"message":"Siparişim nerede?","history":[],"context":{}}"""
        )
        val assistant = gson.fromJson(guestAssistant.body, AssistantChatResponse::class.java)
        assertEquals(200, guestAssistant.status)
        assertTrue(assistant.reply?.startsWith("Hermetik NovaBot yanıtı") == true)
        assertEquals(assistant.reply, assistant.message)
        assertTrue(!guestAssistant.body.contains("\"answer\""))
        assertTrue(!guestAssistant.body.contains("\"response\""))
    }

    private fun get(path: String, authenticated: Boolean): HttpResult {
        return request(path, "GET", authenticated, null)
    }

    private fun post(path: String, authenticated: Boolean, body: String): HttpResult {
        return request(path, "POST", authenticated, body)
    }

    private fun request(path: String, method: String, authenticated: Boolean, body: String?): HttpResult {
        val connection = (URL("$origin$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 3_000
            readTimeout = 3_000
            setRequestProperty("accept", "application/json")
            if (authenticated) setRequestProperty("authorization", "Bearer $token")
            if (body != null) {
                doOutput = true
                setRequestProperty("content-type", "application/json")
            }
        }
        return try {
            if (body != null) {
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
            }
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            HttpResult(status, stream?.bufferedReader()?.use { it.readText() }.orEmpty())
        } finally {
            connection.disconnect()
        }
    }

    private data class HttpResult(val status: Int, val body: String)
}
