package com.novastore.app

import com.google.gson.Gson
import com.novastore.app.core.navigation.safeHttpsTrackingUrl
import com.novastore.app.core.network.isSessionGenerationBindingValid
import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.data.model.AssistantEscalationResponse
import com.novastore.app.data.model.AccountCoupon
import com.novastore.app.data.model.CustomerNotificationTarget
import com.novastore.app.data.model.CustomerQuestionState
import com.novastore.app.data.model.Notification
import com.novastore.app.data.model.Product
import com.novastore.app.data.model.ProductMedia
import com.novastore.app.data.model.ProductQuestion
import com.novastore.app.data.model.SubmitReviewRequest
import com.novastore.app.data.model.UserReview
import com.novastore.app.data.model.customerState
import com.novastore.app.data.model.customerTargetOrNull
import com.novastore.app.data.model.isOwnedByCustomer
import com.novastore.app.data.model.orderedImageUrls
import com.novastore.app.feature.product.detailChipTitle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.http.Header

class Main6sAndroidCustomerContractTest {
    private val gson = Gson()

    @Test
    fun typedNotificationTargetsUseOnlyThePc1Allowlist() {
        val expected = mapOf(
            "order" to CustomerNotificationTarget.Order(9),
            "product" to CustomerNotificationTarget.Product(9),
            "product_question" to CustomerNotificationTarget.ProductQuestion(9),
            "return_request" to CustomerNotificationTarget.ReturnRequest(9),
            "review" to CustomerNotificationTarget.Review(9),
            "support_thread" to CustomerNotificationTarget.SupportThread(9)
        )

        expected.forEach { (type, target) ->
            assertEquals(target, notification(type, 9).customerTargetOrNull())
        }
    }

    @Test
    fun typedNotificationTargetsRejectMissingUnknownAndMaliciousInputs() {
        assertNull(notification(null, 9).customerTargetOrNull())
        assertNull(notification("order", null).customerTargetOrNull())
        assertNull(notification("order", 0).customerTargetOrNull())
        assertNull(notification("order", Int.MAX_VALUE.toLong() + 1).customerTargetOrNull())
        assertNull(notification("https://evil.invalid", 9).customerTargetOrNull())
        assertNull(notification("ORDER", 9).customerTargetOrNull())

        val parsed = gson.fromJson(
            """{"id":1,"user_id":7,"type":"system","message":"x","is_read":false,"created_at":"now","url":"https://evil.invalid","entity_type":"unknown","entity_id":9}""",
            Notification::class.java
        )
        assertNull(parsed.customerTargetOrNull())
    }

    @Test
    fun notificationDtoAcceptsCurrentSnakeAndCompatibilityCamelNames() {
        val snake = gson.fromJson(notificationJson("entity_type", "entity_id"), Notification::class.java)
        val camel = gson.fromJson(notificationJson("entityType", "entityId"), Notification::class.java)
        assertEquals(CustomerNotificationTarget.Product(201), snake.customerTargetOrNull())
        assertEquals(CustomerNotificationTarget.Product(201), camel.customerTargetOrNull())
    }

    @Test
    fun questionStateFollowsStatusAndAnswerTogether() {
        assertEquals(CustomerQuestionState.Pending, question("PENDING", false, null).customerState())
        assertEquals(CustomerQuestionState.Answered, question("ANSWERED", true, "Yanıt").customerState())
        assertEquals(CustomerQuestionState.Invalid, question("ANSWERED", true, null).customerState())
        assertEquals(CustomerQuestionState.Invalid, question("PENDING", false, "Sızmış yanıt").customerState())
    }

    @Test
    fun imageMediaIsMainFirstStableDeduplicatedAndFailClosed() {
        val product = product(
            cover = "https://cdn.invalid/cover.jpg",
            media = listOf(
                ProductMedia(4, 201, "https://cdn.invalid/third.jpg", false, 3, "image"),
                ProductMedia(2, 201, "https://cdn.invalid/cover.jpg", true, 7, "image"),
                ProductMedia(3, 201, "https://cdn.invalid/video.mp4", false, 2, "video"),
                ProductMedia(1, 201, "https://cdn.invalid/first.jpg", false, 1, "image"),
                ProductMedia(5, 201, "https://cdn.invalid/unknown.jpg", false, 0, null)
            )
        )

        assertEquals(
            listOf(
                "https://cdn.invalid/cover.jpg",
                "https://cdn.invalid/first.jpg",
                "https://cdn.invalid/third.jpg"
            ),
            product.orderedImageUrls()
        )
    }

    @Test
    fun reviewPayloadNeverCarriesCustomerIdentityAndOwnStatesDecode() {
        val encoded = gson.toJson(SubmitReviewRequest(productId = 204, rating = 5, comment = "Harika"))
        assertEquals("{\"product_id\":204,\"rating\":5,\"comment\":\"Harika\"}", encoded)
        assertFalse(encoded.contains("user", ignoreCase = true))

        val review = gson.fromJson(
            """{"id":8,"product_id":204,"rating":5,"comment":"Harika","status":"PENDING","created_at":"now","product_name":"Saat","media":[]}""",
            UserReview::class.java
        )
        assertEquals("PENDING", review.status)
        assertTrue(review.media.isEmpty())
    }

    @Test
    fun supportEscalationCarriesThreadIdentityAndServerState() {
        val response = gson.fromJson(
            """{"message":"Aktarıldı","escalation":null,"thread":{"id":8801,"customerId":7001,"status":"TAKEN_OVER","assignedAdminId":4,"source":"AI_HANDOFF"}}""",
            AssistantEscalationResponse::class.java
        )
        assertEquals(8801L, response.thread?.id)
        assertEquals("TAKEN_OVER", response.thread?.status)
        assertTrue(response.thread?.isOwnedByCustomer(7001) == true)
        assertFalse(response.thread?.isOwnedByCustomer(7002) == true)
        assertFalse(response.thread?.copy(customerId = null)?.isOwnedByCustomer(7001) == true)
    }

    @Test
    fun trackingLinksAreHttpsOnlyAndCredentialFree() {
        assertNull(safeHttpsTrackingUrl("https://tracking.example.invalid/ABC"))
        assertEquals(
            "https://tracking.example.invalid/ABC",
            safeHttpsTrackingUrl(
                "https://tracking.example.invalid/ABC",
                allowedHosts = setOf("tracking.example.invalid")
            )
        )
        assertNull(safeHttpsTrackingUrl("http://tracking.example.invalid/ABC"))
        assertNull(safeHttpsTrackingUrl("javascript:alert(1)"))
        assertNull(safeHttpsTrackingUrl("https://user:secret@tracking.example.invalid/ABC"))
        assertNull(safeHttpsTrackingUrl("https://tracking.example.invalid:8443/ABC"))
        assertNull(safeHttpsTrackingUrl("https://tracking.example.invalid/ABC\nInjected"))
        assertNull(
            safeHttpsTrackingUrl(
                "https://carrier.example.evil.invalid/ABC",
                allowedHosts = setOf("carrier.example")
            )
        )
    }

    @Test
    fun sensitiveRequestsCannotCrossAChangedCustomerSession() {
        assertTrue(isSessionGenerationBindingValid(null, 8))
        assertTrue(isSessionGenerationBindingValid(8, 8))
        assertFalse(isSessionGenerationBindingValid(8, 9))
    }

    @Test
    fun selectedCouponCopyRemainsTentativeUntilServerValidation() {
        val coupon = AccountCoupon(
            id = 1,
            code = "NOVA150",
            discountType = "fixed",
            discountValue = 150.0,
            minOrderAmount = 1000.0,
            maxDiscountAmount = 150.0,
            startsAt = null,
            endsAt = null
        )

        assertEquals("Seçildi: NOVA150", coupon.detailChipTitle(selected = true))
        assertFalse(coupon.detailChipTitle(selected = true).contains("Uygulandı"))
    }

    @Test
    fun authenticatedMutationContractsAllCarryTheInternalGenerationBinding() {
        val methodNames = setOf(
            "askProductQuestion",
            "submitReview",
            "updateProfile",
            "changePassword",
            "sendEmailVerification",
            "verifyEmailCode",
            "sendPhoneCode",
            "verifyPhoneCode",
            "markNotificationRead",
            "markAllNotificationsRead",
            "cancelOrder",
            "sendSupportMessage",
            "createReturnRequest",
            "createAddress",
            "updateAddress",
            "deleteAddress",
            "setDefaultAddress",
            "getFavorites",
            "addFavorite",
            "removeFavorite",
            "syncFavorites",
            "getSharedCart",
            "putSharedCart",
            "getSharedCheckout",
            "putSharedCheckout",
            "initializePayment",
            "getPaymentStatus",
            "sendAssistantMessage",
            "escalateAssistantConversation"
        )

        methodNames.forEach { methodName ->
            val methods = NovaStoreApi::class.java.methods.filter { it.name == methodName }
            assertTrue("Missing API method $methodName", methods.isNotEmpty())
            assertTrue("Missing session generation binding on $methodName", methods.any { method ->
                method.parameterAnnotations.flatten().filterIsInstance<Header>()
                    .any { it.value == "X-NovaStore-Session-Generation" }
            })
        }
    }

    private fun notification(type: String?, id: Long?): Notification = Notification(
        id = 1,
        userId = 7,
        type = "system",
        message = "message",
        isRead = false,
        createdAt = "now",
        entityType = type,
        entityId = id
    )

    private fun notificationJson(typeKey: String, idKey: String): String =
        """{"id":1,"user_id":7,"type":"system","message":"x","is_read":false,"created_at":"now","$typeKey":"product","$idKey":201}"""

    private fun question(status: String?, isAnswered: Boolean?, answer: String?): ProductQuestion = ProductQuestion(
        id = 1,
        productId = 201,
        userId = 7,
        question = "Soru",
        answer = answer,
        createdAt = "now",
        answeredAt = null,
        userName = null,
        productName = "Ürün",
        productImage = null,
        status = status,
        isAnswered = isAnswered
    )

    private fun product(cover: String?, media: List<ProductMedia>): Product = Product(
        id = 201,
        name = "Ürün",
        price = 100.0,
        oldPrice = null,
        stock = 1,
        description = null,
        imageUrl = cover,
        category = "Elektronik",
        categories = listOf("Elektronik"),
        averageRating = "0.0",
        reviewCount = 0,
        media = media,
        categoryRelations = emptyList()
    )
}
