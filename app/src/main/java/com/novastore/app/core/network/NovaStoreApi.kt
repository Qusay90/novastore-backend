package com.novastore.app.core.network

import com.novastore.app.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface NovaStoreApi {
    // Products
    @GET("api/products")
    suspend fun getProducts(
        @Query("category") category: String? = null,
        @Query("includeDescendants") includeDescendants: Boolean? = null
    ): List<Product>

    @GET("api/products/{id}")
    suspend fun getProduct(@Path("id") id: Int): Product

    @POST("api/questions/ask")
    suspend fun askProductQuestion(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: AskQuestionRequest
    ): BasicMessageResponse

    @GET("api/questions/product/{productId}")
    suspend fun getProductQuestions(@Path("productId") productId: Int): List<ProductQuestion>

    @GET("api/questions/user")
    suspend fun getUserProductQuestions(): List<ProductQuestion>

    @GET("api/reviews/product/{productId}")
    suspend fun getProductReviews(@Path("productId") productId: Int): ProductReviewsResponse

    @POST("api/reviews")
    suspend fun submitReview(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: SubmitReviewRequest
    ): SubmitReviewResponse

    // Categories
    @GET("api/public/categories")
    suspend fun getCategories(@Query("format") format: String = "tree"): List<Category>

    // Auth
    @POST("api/users/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @POST("api/users/register")
    suspend fun register(@Body body: RegisterRequest): RegisterResponse

    @POST("api/users/logout")
    suspend fun logout(): Response<Unit>

    @PATCH("api/users/me")
    suspend fun updateProfile(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: UpdateProfileRequest
    ): UpdateProfileResponse

    @GET("api/users/me")
    suspend fun getCurrentUserProfile(): UpdateProfileResponse

    @GET("api/users/security-status")
    suspend fun getSecurityStatus(): SecurityStatus

    @POST("api/users/change-password")
    suspend fun changePassword(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: ChangePasswordRequest
    ): BasicMessageResponse

    @POST("api/users/verification/email/send")
    suspend fun sendEmailVerification(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: EmailVerificationSendRequest = EmailVerificationSendRequest()
    ): BasicMessageResponse

    @POST("api/users/verification/email/verify")
    suspend fun verifyEmailCode(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: VerificationCodeRequest
    ): BasicMessageResponse

    @POST("api/users/verification/phone/send")
    suspend fun sendPhoneCode(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: PhoneVerificationSendRequest
    ): BasicMessageResponse

    @POST("api/users/verification/phone/verify")
    suspend fun verifyPhoneCode(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: VerificationCodeRequest
    ): BasicMessageResponse

    @POST("api/users/password-reset/request")
    suspend fun requestPasswordReset(@Body body: PasswordResetCodeRequest): BasicMessageResponse

    @POST("api/users/password-reset/verify")
    suspend fun verifyPasswordResetCode(
        @Body body: PasswordResetCodeVerificationRequest
    ): PasswordResetCodeVerificationResponse

    @POST("api/users/password-reset/complete")
    suspend fun completePasswordReset(
        @Body body: PasswordResetCompletionRequest
    ): BasicMessageResponse

    suspend fun setupTwoFactor(): BasicMessageResponse {
        throw UnsupportedOperationException("CUSTOMER_TWO_FACTOR_UNAVAILABLE")
    }

    // Notifications
    @GET("api/notifications/user/{userId}")
    suspend fun getNotifications(@Path("userId") userId: Int): List<Notification>

    @PATCH("api/notifications/{id}/read")
    suspend fun markNotificationRead(
        @Path("id") id: Int,
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null
    )

    @PATCH("api/notifications/read-all/{userId}")
    suspend fun markAllNotificationsRead(
        @Path("userId") userId: Int,
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null
    ): BasicMessageResponse

    // Account
    @GET("api/orders/user/{userId}")
    suspend fun getUserOrders(@Path("userId") userId: Int): List<AccountOrder>

    @POST("api/orders/{id}/cancel")
    suspend fun cancelOrder(
        @Path("id") orderId: Int,
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: CancelOrderRequestBody
    ): BasicMessageResponse

    @GET("api/campaigns/coupons/active")
    suspend fun getActiveCoupons(): List<AccountCoupon>

    @GET("api/messages/history/{userId}")
    suspend fun getChatHistory(@Path("userId") userId: Int): List<AccountMessage>

    @POST("api/messages/send")
    suspend fun sendSupportMessage(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: SendMessageRequest
    ): AccountMessage

    @POST("api/returns")
    suspend fun createReturnRequest(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: ReturnRequestBody
    ): BasicMessageResponse

    @GET("api/returns/{id}")
    suspend fun getReturnRequest(@Path("id") id: Long): ReturnRequestDetails

    @GET("api/reviews/user/{userId}")
    suspend fun getUserReviews(@Path("userId") userId: Int): List<UserReview>

    @GET("api/addresses")
    suspend fun getAddresses(): List<CustomerAddress>

    @POST("api/addresses")
    suspend fun createAddress(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: CustomerAddress
    ): CustomerAddress

    @PUT("api/addresses/{id}")
    suspend fun updateAddress(
        @Path("id") id: Long,
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: CustomerAddress
    ): CustomerAddress

    @DELETE("api/addresses/{id}")
    suspend fun deleteAddress(
        @Path("id") id: Long,
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null
    ): BasicMessageResponse

    @PATCH("api/addresses/{id}/default")
    suspend fun setDefaultAddress(
        @Path("id") id: Long,
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null
    ): CustomerAddress

    // Favorites
    @GET("api/favorites")
    suspend fun getFavorites(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null
    ): FavoritesResponse

    @POST("api/favorites/{productId}")
    suspend fun addFavorite(
        @Path("productId") productId: Int,
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null
    ): FavoriteMutationResponse

    @DELETE("api/favorites/{productId}")
    suspend fun removeFavorite(
        @Path("productId") productId: Int,
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null
    ): FavoriteMutationResponse

    @POST("api/favorites/sync")
    suspend fun syncFavorites(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: FavoriteSyncRequest
    ): FavoritesResponse

    // Shared state
    @GET("api/shared-state/cart")
    suspend fun getSharedCart(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null
    ): SharedCartStateResponse

    @PUT("api/shared-state/cart")
    suspend fun putSharedCart(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: SharedCartStateRequest
    ): SharedCartStateResponse

    @GET("api/shared-state/checkout")
    suspend fun getSharedCheckout(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null
    ): SharedCheckoutStateResponse

    @PUT("api/shared-state/checkout")
    suspend fun putSharedCheckout(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: SharedCheckoutStateRequest
    ): SharedCheckoutStateResponse

    // Payments
    @POST("api/payments/initialize")
    suspend fun initializePayment(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: PaymentRequest
    ): PaymentResponse

    @GET("api/payments/status")
    suspend fun getPaymentStatus(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Query("paymentRef") paymentRef: String,
        @Query("orderId") orderId: Int
    ): PaymentStatusResponse

    // AI Assistant
    @POST("api/assistant/chat")
    suspend fun sendAssistantMessage(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: AssistantChatRequest
    ): AssistantChatResponse

    @POST("api/assistant/escalate")
    suspend fun escalateAssistantConversation(
        @Header("X-NovaStore-Session-Generation") sessionGeneration: Long? = null,
        @Body body: AssistantEscalationRequest
    ): AssistantEscalationResponse
}
