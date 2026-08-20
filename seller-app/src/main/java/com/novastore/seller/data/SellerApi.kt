package com.novastore.seller.data

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.POST

interface SellerApi {
    @POST("api/seller/v1/auth/login")
    suspend fun login(@Body request: SellerLoginRequest): Response<SellerTokenResponse>

    @POST("api/seller/v1/auth/refresh")
    suspend fun refresh(@Body request: SellerRefreshRequest): Response<SellerTokenResponse>

    @POST("api/seller/v1/auth/logout")
    suspend fun logout(): Response<JsonObject>

    @POST("api/seller/v1/auth/logout-all")
    suspend fun logoutAll(): Response<JsonObject>

    @GET("api/seller/v1/context")
    suspend fun context(): Response<SellerContextResponse>

    @GET("api/seller/v1/team/roles")
    suspend fun teamRoles(): Response<JsonElement>

    @GET("api/seller/v1/team/members")
    suspend fun teamMembers(): Response<JsonElement>

    @GET("api/seller/v1/dashboard")
    suspend fun dashboard(): Response<JsonElement>

    @GET("api/seller/v1/offers")
    suspend fun offers(): Response<JsonElement>

    @PATCH("api/seller/v1/offers/{offerId}")
    suspend fun updateOffer(
        @Path("offerId") offerId: Long,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: JsonObject
    ): Response<JsonElement>

    @GET("api/seller/v1/inventory")
    suspend fun inventory(): Response<JsonElement>

    @POST("api/seller/v1/inventory/adjustments")
    suspend fun adjustInventory(
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: JsonObject
    ): Response<JsonElement>

    @GET("api/seller/v1/orders")
    suspend fun orders(): Response<JsonElement>

    @GET("api/seller/v1/orders/{orderId}")
    suspend fun order(@Path("orderId") orderId: Long): Response<JsonElement>

    @POST("api/seller/v1/orders/{orderId}/commands")
    suspend fun orderCommand(
        @Path("orderId") orderId: Long,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: JsonObject
    ): Response<JsonElement>

    @GET("api/seller/v1/finance/summary")
    suspend fun financeSummary(): Response<JsonElement>

    @GET("api/seller/v1/finance/ledger")
    suspend fun financeLedger(): Response<JsonElement>

    @GET("api/seller/v1/stores/{storeId}")
    suspend fun store(@Path("storeId") storeId: Long): Response<JsonElement>

    @PATCH("api/seller/v1/stores/{storeId}")
    suspend fun updateStore(
        @Path("storeId") storeId: Long,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: JsonObject
    ): Response<JsonElement>

    @GET("api/seller/v1/support/conversations")
    suspend fun support(): Response<JsonElement>

    @POST("api/seller/v1/support/conversations")
    suspend fun createSupportConversation(
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: JsonObject
    ): Response<JsonElement>

    @POST("api/seller/v1/support/messages")
    suspend fun addSupportMessage(
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: JsonObject
    ): Response<JsonElement>

    @GET("api/seller/v1/security/sessions")
    suspend fun sessions(): Response<JsonElement>
}
