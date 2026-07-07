package com.novastore.app.core.network

import com.novastore.app.data.model.*
import retrofit2.http.*

interface NovaStoreApi {
    // Products
    @GET("api/products")
    suspend fun getProducts(): List<Product>

    @GET("api/products/{id}")
    suspend fun getProduct(@Path("id") id: Int): Product

    @POST("api/questions/ask")
    suspend fun askProductQuestion(@Body body: AskQuestionRequest): BasicMessageResponse

    @GET("api/questions/product/{productId}")
    suspend fun getProductQuestions(@Path("productId") productId: Int): List<ProductQuestion>

    @GET("api/questions/user")
    suspend fun getUserProductQuestions(): List<ProductQuestion>

    // Categories
    @GET("api/categories")
    suspend fun getCategories(): List<Category>

    // Auth
    @POST("api/users/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @POST("api/users/register")
    suspend fun register(@Body body: RegisterRequest): RegisterResponse

    @PATCH("api/users/me")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): UpdateProfileResponse

    @GET("api/users/me")
    suspend fun getCurrentUserProfile(): UpdateProfileResponse

    @GET("api/users/security-status")
    suspend fun getSecurityStatus(): SecurityStatus

    @POST("api/users/change-password")
    suspend fun changePassword(@Body body: ChangePasswordRequest): BasicMessageResponse

    @POST("api/auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): BasicMessageResponse

    @POST("api/auth/phone/send-code")
    suspend fun sendPhoneCode(@Body body: PhoneCodeRequest): BasicMessageResponse

    @POST("api/auth/phone/verify-code")
    suspend fun verifyPhoneCode(@Body body: PhoneCodeRequest): BasicMessageResponse

    @POST("api/auth/email/send-verification")
    suspend fun sendEmailVerification(): BasicMessageResponse

    @POST("api/auth/2fa/setup")
    suspend fun setupTwoFactor(): BasicMessageResponse

    // Notifications
    @GET("api/notifications/user/{userId}")
    suspend fun getNotifications(@Path("userId") userId: Int): List<Notification>

    @PATCH("api/notifications/{id}/read")
    suspend fun markNotificationRead(@Path("id") id: Int)

    @PATCH("api/notifications/read-all/{userId}")
    suspend fun markAllNotificationsRead(@Path("userId") userId: Int): BasicMessageResponse

    // Account
    @GET("api/orders/user/{userId}")
    suspend fun getUserOrders(@Path("userId") userId: Int): List<AccountOrder>

    @POST("api/orders/{id}/cancel")
    suspend fun cancelOrder(@Path("id") orderId: Int): BasicMessageResponse

    @GET("api/campaigns/coupons/active")
    suspend fun getActiveCoupons(): List<AccountCoupon>

    @GET("api/messages/history/{userId}")
    suspend fun getChatHistory(@Path("userId") userId: Int): List<AccountMessage>

    @POST("api/messages/send")
    suspend fun sendSupportMessage(@Body body: SendMessageRequest): AccountMessage

    @POST("api/returns")
    suspend fun createReturnRequest(@Body body: ReturnRequestBody): BasicMessageResponse

    @GET("api/reviews/user/{userId}")
    suspend fun getUserReviews(@Path("userId") userId: Int): List<UserReview>

    @GET("api/addresses")
    suspend fun getAddresses(): List<CustomerAddress>

    @POST("api/addresses")
    suspend fun createAddress(@Body body: CustomerAddress): CustomerAddress

    @PUT("api/addresses/{id}")
    suspend fun updateAddress(@Path("id") id: Long, @Body body: CustomerAddress): CustomerAddress

    @DELETE("api/addresses/{id}")
    suspend fun deleteAddress(@Path("id") id: Long): BasicMessageResponse

    @PATCH("api/addresses/{id}/default")
    suspend fun setDefaultAddress(@Path("id") id: Long): CustomerAddress

    // Favorites
    @GET("api/favorites")
    suspend fun getFavorites(): FavoritesResponse

    @POST("api/favorites/{productId}")
    suspend fun addFavorite(@Path("productId") productId: Int): FavoriteMutationResponse

    @DELETE("api/favorites/{productId}")
    suspend fun removeFavorite(@Path("productId") productId: Int): FavoriteMutationResponse

    @POST("api/favorites/sync")
    suspend fun syncFavorites(@Body body: FavoriteSyncRequest): FavoritesResponse

    // Shared state
    @GET("api/shared-state/cart")
    suspend fun getSharedCart(): SharedCartStateResponse

    @PUT("api/shared-state/cart")
    suspend fun putSharedCart(@Body body: SharedCartStateRequest): SharedCartStateResponse

    @GET("api/shared-state/checkout")
    suspend fun getSharedCheckout(): SharedCheckoutStateResponse

    @PUT("api/shared-state/checkout")
    suspend fun putSharedCheckout(@Body body: SharedCheckoutStateRequest): SharedCheckoutStateResponse

    // Payments
    @POST("api/payments/initialize")
    suspend fun initializePayment(@Body body: PaymentRequest): PaymentResponse

    @GET("api/payments/status")
    suspend fun getPaymentStatus(
        @Query("paymentRef") paymentRef: String,
        @Query("orderId") orderId: Int
    ): PaymentStatusResponse

    // AI Assistant
    @POST("api/assistant/chat")
    suspend fun sendAssistantMessage(@Body body: AssistantChatRequest): AssistantChatResponse

    @POST("api/assistant/escalate")
    suspend fun escalateAssistantConversation(@Body body: AssistantEscalationRequest): AssistantEscalationResponse
}
