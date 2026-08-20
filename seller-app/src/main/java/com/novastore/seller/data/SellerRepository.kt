package com.novastore.seller.data

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.novastore.seller.BuildConfig
import java.io.IOException
import java.math.BigInteger
import java.util.UUID
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.withLock
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class SellerRepository(private val sessionStore: SellerSessionStore) {
    private val api: SellerApi? by lazy {
        val baseUrl = BuildConfig.SELLER_API_BASE_URL.trim()
        if (baseUrl.isBlank()) null else Retrofit.Builder()
            .baseUrl(baseUrl)
            .addConverterFactory(GsonConverterFactory.create())
            .client(OkHttpClient.Builder().addInterceptor(AuthorizationInterceptor(sessionStore)).build())
            .build()
            .create(SellerApi::class.java)
    }

    suspend fun login(identifier: String, password: String): SellerUiState {
        if (api == null) return SellerUiState.Disabled("Bu sürüm için seller API yapılandırması gerekli.")
        return try {
            val response = api!!.login(SellerLoginRequest(identifier, password))
            val tokens = response.body()
            if (response.isSuccessful && tokens != null) {
                sessionStore.save(tokens)
                SellerUiState.Content(SellerPage("Genel Bakış", emptyList(), SellerScreen.DASHBOARD))
            } else failure(response)
        } catch (_: IOException) { SellerUiState.Offline("Bağlantıyı kontrol edip tekrar deneyin.")
        } catch (_: RuntimeException) { malformedResponse() }
    }

    fun hasPersistedSession(): Boolean = !sessionStore.accessToken.isNullOrBlank() && !sessionStore.refreshToken.isNullOrBlank()

    suspend fun load(screen: SellerScreen): SellerUiState = load(screen, allowRefresh = true)

    private suspend fun load(screen: SellerScreen, allowRefresh: Boolean): SellerUiState {
        if (api == null) return SellerUiState.Disabled("Bu sürüm için seller API yapılandırması gerekli.")
        if (sessionStore.accessToken.isNullOrBlank()) return SellerUiState.Unauthorized
        if (screen in setOf(
                SellerScreen.ONBOARDING,
                SellerScreen.ANALYTICS,
                SellerScreen.CAMPAIGNS,
                SellerScreen.NOTIFICATIONS,
                SellerScreen.CUSTOMER_MESSAGES
            )
        ) {
            return SellerUiState.Disabled("Bu özellik için canlı ve tenant-safe seller API capability’si henüz etkin değil.")
        }
        if (screen == SellerScreen.ORDER_DETAIL) {
            return SellerUiState.Disabled("Sipariş detayı yalnız seçili ve sunucudan doğrulanmış sipariş kimliğiyle açılır.")
        }
        if (screen == SellerScreen.DASHBOARD) return loadDashboard(allowRefresh)
        if (screen == SellerScreen.FINANCE) return loadFinance(allowRefresh)
        if (screen == SellerScreen.STORE) return loadStore(allowRefresh)
        if (screen == SellerScreen.CONTEXT) return resolveContext(allowRefresh)
        if (screen == SellerScreen.TEAM) return loadTeam(allowRefresh)
        return try {
            val response = when (screen) {
                SellerScreen.DASHBOARD -> error("Dashboard is handled before the request switch.")
                SellerScreen.PRODUCTS -> api!!.offers()
                SellerScreen.INVENTORY -> api!!.inventory()
                SellerScreen.ORDERS -> api!!.orders()
                SellerScreen.FINANCE -> error("Finance is handled before the request switch.")
                SellerScreen.SUPPORT -> api!!.support()
                SellerScreen.SECURITY -> api!!.sessions()
                SellerScreen.STORE, SellerScreen.CONTEXT, SellerScreen.TEAM -> error("Store, context and team screens are handled before the request switch.")
                SellerScreen.ONBOARDING,
                SellerScreen.ORDER_DETAIL,
                SellerScreen.ANALYTICS,
                SellerScreen.CAMPAIGNS,
                SellerScreen.NOTIFICATIONS,
                SellerScreen.CUSTOMER_MESSAGES -> error("Disabled and selected-resource screens are handled before the request switch.")
            }
            if (response.code() == 401) {
                if (allowRefresh && refreshIfPossible()) return load(screen, allowRefresh = false)
                if (!allowRefresh) return failure(response)
                return unauthorizedAfterRefreshFailure()
            }
            if (response.isSuccessful) page(screen, response.body()) else failure(response)
        } catch (_: IOException) { SellerUiState.Offline("Çevrimdışısınız. Bağlantı geri geldiğinde güvenle yenileyin.")
        } catch (_: RuntimeException) { malformedResponse() }
    }

    private suspend fun loadDashboard(allowRefresh: Boolean): SellerUiState = try {
        val dashboardResponse = api!!.dashboard()
        if (dashboardResponse.code() == 401) {
            if (allowRefresh && refreshIfPossible()) return loadDashboard(allowRefresh = false)
            if (!allowRefresh) return failure(dashboardResponse)
            return unauthorizedAfterRefreshFailure()
        }
        if (!dashboardResponse.isSuccessful) return failure(dashboardResponse)
        val contextResponse = api!!.context()
        if (contextResponse.code() == 401) {
            if (allowRefresh && refreshIfPossible()) return loadDashboard(allowRefresh = false)
            if (!allowRefresh) return failure(contextResponse)
            return unauthorizedAfterRefreshFailure()
        }
        val context = contextResponse.body()
        if (!contextResponse.isSuccessful || context == null) return failure(contextResponse)
        val dashboard = dashboardResponse.body().asObjectOrNull() ?: return malformedResponse()
        val finance = dashboard.get("finance").asObjectOrNull() ?: JsonObject()
        val orders = dashboard.get("orders_by_status")
            ?.objectList()
            .orEmpty()
            .mapNotNull { row ->
                val status = row.text("status") ?: return@mapNotNull null
                status to (row.long("count")?.toInt() ?: 0)
            }
        val family = SellerDashboardData(
            storeName = context.organization.displayName,
            currency = finance.text("currency") ?: "TRY",
            grossMinor = finance.long("gross_minor") ?: 0,
            availableMinor = finance.long("available_minor") ?: 0,
            lowStockCount = dashboard.long("low_stock_count")?.toInt() ?: 0,
            ordersByStatus = orders
        )
        val rows = listOf("Mağaza" to family.storeName, "Düşük stok" to family.lowStockCount.toString())
        SellerUiState.Content(SellerPage(SellerScreen.DASHBOARD.title, rows, SellerScreen.DASHBOARD, familyData = family))
    } catch (_: IOException) {
        SellerUiState.Offline("Mağaza özeti çevrimdışı doğrulanamaz.")
    } catch (_: RuntimeException) {
        malformedResponse()
    }

    private suspend fun loadFinance(allowRefresh: Boolean): SellerUiState = try {
        val summaryResponse = api!!.financeSummary()
        if (summaryResponse.code() == 401) {
            if (allowRefresh && refreshIfPossible()) return loadFinance(allowRefresh = false)
            if (!allowRefresh) return failure(summaryResponse)
            return unauthorizedAfterRefreshFailure()
        }
        if (!summaryResponse.isSuccessful) return failure(summaryResponse)
        val ledgerResponse = api!!.financeLedger()
        if (ledgerResponse.code() == 401) {
            if (allowRefresh && refreshIfPossible()) return loadFinance(allowRefresh = false)
            if (!allowRefresh) return failure(ledgerResponse)
            return unauthorizedAfterRefreshFailure()
        }
        if (!ledgerResponse.isSuccessful) return failure(ledgerResponse)
        val summary = summaryResponse.body().asObjectOrNull() ?: return malformedResponse()
        val rawLedger = ledgerResponse.body()
            ?.takeIf { it.isJsonArray }
            ?.asJsonArray
            ?: return malformedResponse()
        if (rawLedger.any { !it.isJsonObject }) return malformedResponse()
        val ledger = rawLedger.map { element ->
            val row = element.asJsonObject
            val entryCurrency = row.text("currency") ?: return malformedResponse()
            if (entryCurrency != summary.text("currency")) return malformedResponse()
            SellerFinanceLedgerItem(
                id = row.long("id") ?: return malformedResponse(),
                entryType = row.text("entry_type") ?: return malformedResponse(),
                amountMinor = row.long("amount_minor") ?: return malformedResponse(),
                currency = entryCurrency
            )
        }
        val currency = summary.text("currency") ?: return malformedResponse()
        val family = SellerFinanceData(
            currency = currency,
            grossMinor = summary.long("gross_minor") ?: return malformedResponse(),
            commissionMinor = summary.long("commission_minor") ?: return malformedResponse(),
            refundMinor = summary.long("refund_minor") ?: return malformedResponse(),
            netReceivableMinor = summary.long("net_receivable_minor") ?: return malformedResponse(),
            availableMinor = summary.long("available_minor") ?: return malformedResponse(),
            ledger = ledger
        )
        SellerUiState.Content(SellerPage(SellerScreen.FINANCE.title, emptyList(), SellerScreen.FINANCE, familyData = family))
    } catch (_: IOException) {
        SellerUiState.Offline("Finans verileri çevrimdışı doğrulanamaz.")
    } catch (_: RuntimeException) {
        malformedResponse()
    }

    private suspend fun loadStore(allowRefresh: Boolean): SellerUiState = try {
        val context = api!!.context()
        if (context.code() == 401) {
            if (allowRefresh && refreshIfPossible()) return loadStore(allowRefresh = false)
            if (!allowRefresh) return failure(context)
            return unauthorizedAfterRefreshFailure()
        }
        if (!context.isSuccessful) return failure(context)
        val body = context.body() ?: return SellerUiState.Empty("Seçili mağaza bulunmuyor.")
        if (body.selectionRequired) return SellerUiState.Disabled("Birden fazla mağaza için sunucuda bağlam seçimi gerekli.")
        val storeId = body.storeIds.singleOrNull() ?: return SellerUiState.Empty("Bu hesap için mağaza kapsamı yok.")
        val store = api!!.store(storeId)
        if (store.code() == 401) {
            if (allowRefresh && refreshIfPossible()) return loadStore(allowRefresh = false)
            if (!allowRefresh) return failure(store)
            return unauthorizedAfterRefreshFailure()
        }
        if (store.isSuccessful) page(SellerScreen.STORE, store.body()) else failure(store)
    } catch (_: IOException) {
        SellerUiState.Offline("Mağaza bağlamı çevrimdışı doğrulanamaz.")
    } catch (_: RuntimeException) {
        malformedResponse()
    }

    private suspend fun loadTeam(allowRefresh: Boolean): SellerUiState = try {
        val membersResponse = api!!.teamMembers()
        if (membersResponse.code() == 401) {
            if (allowRefresh && refreshIfPossible()) return loadTeam(allowRefresh = false)
            if (!allowRefresh) return failure(membersResponse)
            return unauthorizedAfterRefreshFailure()
        }
        if (!membersResponse.isSuccessful) return failure(membersResponse)

        val contextResponse = api!!.context()
        if (contextResponse.code() == 401) {
            if (allowRefresh && refreshIfPossible()) return loadTeam(allowRefresh = false)
            if (!allowRefresh) return failure(contextResponse)
            return unauthorizedAfterRefreshFailure()
        }
        if (!contextResponse.isSuccessful || contextResponse.body() == null) return failure(contextResponse)

        val rolesResponse = api!!.teamRoles()
        if (rolesResponse.code() == 401) {
            if (allowRefresh && refreshIfPossible()) return loadTeam(allowRefresh = false)
            if (!allowRefresh) return failure(rolesResponse)
            return unauthorizedAfterRefreshFailure()
        }
        if (!rolesResponse.isSuccessful) return failure(rolesResponse)

        val roleCode = rolesResponse.body().roleCode() ?: return malformedResponse()
        val members = membersResponse.body().teamMembers() ?: return malformedResponse()
        val team = SellerTeamPage(
            storeName = contextResponse.body()!!.organization.displayName,
            sessionRoleCode = roleCode,
            members = members
        )
        SellerUiState.Content(SellerPage("Ekip ve Yetkiler", emptyList(), SellerScreen.TEAM, team = team))
    } catch (_: IOException) {
        SellerUiState.Offline("Ekip bilgileri çevrimdışı doğrulanamaz.")
    } catch (_: RuntimeException) {
        malformedResponse()
    }

    suspend fun resolveContext(): SellerUiState = resolveContext(allowRefresh = true)

    private suspend fun resolveContext(allowRefresh: Boolean): SellerUiState {
        if (api == null) return SellerUiState.Disabled("Seller API yapılandırması gerekli.")
        return try {
            val response = api!!.context()
            if (response.code() == 401) {
                if (allowRefresh && refreshIfPossible()) return resolveContext(allowRefresh = false)
                if (!allowRefresh) return failure(response)
                return unauthorizedAfterRefreshFailure()
            }
            val body = response.body()
            if (response.isSuccessful && body != null) {
                val rows = listOf("Mağaza" to body.organization.displayName, "Kapsam" to if (body.selectionRequired) "Mağaza seçimi gerekli" else "Yetkili bağlam")
                SellerUiState.Content(SellerPage("Mağaza bağlamı", rows, SellerScreen.CONTEXT))
            } else failure(response)
        } catch (_: IOException) { SellerUiState.Offline("Mağaza bağlamı çevrimdışı doğrulanamaz.")
        } catch (_: RuntimeException) { malformedResponse() }
    }

    /**
     * Debug-UAT mutation driver. The only caller is a BuildConfig-gated Android UI panel. Every
     * request still traverses Retrofit, seller auth, live-session, tenant and permission middleware.
     * No response body, token, credential or SQL detail is returned to the UI.
     */
    suspend fun performMutation(action: SellerMutationAction): SellerMutationResult {
        if (!BuildConfig.SELLER_TEST_STATE_ENABLED) {
            return mutationResult(action, false, "SELLER_TEST_HARNESS_DISABLED")
        }
        val current = api ?: return mutationResult(action, false, "SELLER_API_DISABLED")
        if (sessionStore.accessToken.isNullOrBlank()) return mutationResult(action, false, "SELLER_SESSION_REQUIRED")
        return try {
            when (action) {
                SellerMutationAction.STORE_UPDATE -> {
                    val target = loadStoreMutationTarget(current) ?: return mutationResult(action, false, "STORE_TARGET_MISSING")
                    val body = JsonObject().apply {
                        addProperty("description", "Android yerel UAT doğrulandı")
                        addProperty("revision", target.revision)
                    }
                    expectStatus(action, current.updateStore(target.id, key("store-update"), body), setOf(200))
                }
                SellerMutationAction.STORE_PROTECTED_FIELD_DENIAL -> {
                    val target = loadStoreMutationTarget(current) ?: return mutationResult(action, false, "STORE_TARGET_MISSING")
                    val body = JsonObject().apply {
                        addProperty("owner_user_id", 999999)
                        addProperty("revision", target.revision)
                    }
                    expectStatus(action, current.updateStore(target.id, key("store-protected"), body), setOf(400), setOf("VALIDATION_FAILED"))
                }
                SellerMutationAction.STORE_CROSS_TENANT_DENIAL -> {
                    val target = SellerMutationUatTargets.crossTenant
                        ?: return mutationResult(action, false, "CROSS_TENANT_TARGET_REQUIRED")
                    val body = JsonObject().apply {
                        addProperty("description", "Yabancı mağaza yazımı reddedilmelidir")
                        addProperty("revision", target.storeRevision)
                    }
                    expectSafeNotFound(action, current.updateStore(target.storeId, key("store-cross-tenant"), body))
                }
                SellerMutationAction.OFFER_UPDATE -> {
                    val target = loadOfferMutationTarget(current) ?: return mutationResult(action, false, "OFFER_TARGET_MISSING")
                    val body = JsonObject().apply {
                        addProperty("seller_sku", target.sellerSku)
                        addProperty("price_minor", target.priceMinor + 1)
                        addProperty("visibility", target.visibility)
                        addProperty("revision", target.revision)
                    }
                    expectStatus(action, current.updateOffer(target.id, key("offer-update"), body), setOf(200))
                }
                SellerMutationAction.OFFER_PROTECTED_FIELD_DENIAL -> {
                    val target = loadOfferMutationTarget(current) ?: return mutationResult(action, false, "OFFER_TARGET_MISSING")
                    val body = JsonObject().apply {
                        addProperty("product_id", 999999)
                        addProperty("revision", target.revision)
                    }
                    expectStatus(action, current.updateOffer(target.id, key("offer-protected"), body), setOf(400), setOf("VALIDATION_FAILED"))
                }
                SellerMutationAction.OFFER_CROSS_TENANT_DENIAL -> {
                    val target = SellerMutationUatTargets.crossTenant
                        ?: return mutationResult(action, false, "CROSS_TENANT_TARGET_REQUIRED")
                    val body = JsonObject().apply {
                        addProperty("seller_sku", "FOREIGN-STORE-DENIED")
                        addProperty("price_minor", 1)
                        addProperty("visibility", "private")
                        addProperty("revision", target.offerRevision)
                    }
                    expectSafeNotFound(action, current.updateOffer(target.offerId, key("offer-cross-tenant"), body))
                }
                SellerMutationAction.INVENTORY_UPDATE -> {
                    val target = loadInventoryMutationTarget(current) ?: return mutationResult(action, false, "INVENTORY_TARGET_MISSING")
                    expectStatus(action, current.adjustInventory(key("inventory-update"), inventoryBody(target, 1)), setOf(200))
                }
                SellerMutationAction.INVENTORY_NEGATIVE_DENIAL -> {
                    val target = loadInventoryMutationTarget(current) ?: return mutationResult(action, false, "INVENTORY_TARGET_MISSING")
                    expectStatus(
                        action,
                        current.adjustInventory(key("inventory-negative"), inventoryBody(target, -(target.quantity + 1))),
                        setOf(409),
                        setOf("NEGATIVE_STOCK_FORBIDDEN")
                    )
                }
                SellerMutationAction.INVENTORY_STALE_CONFLICT -> {
                    val target = loadInventoryMutationTarget(current) ?: return mutationResult(action, false, "INVENTORY_TARGET_MISSING")
                    if (target.revision <= 1) return mutationResult(action, false, "STALE_REVISION_PRECONDITION_UNPROVEN")
                    val stale = target.copy(revision = target.revision - 1)
                    expectStatus(
                        action,
                        current.adjustInventory(key("inventory-stale"), inventoryBody(stale, 1)),
                        setOf(409),
                        setOf("REVISION_CONFLICT")
                    )
                }
                SellerMutationAction.INVENTORY_CONCURRENT_CONFLICT -> coroutineScope {
                    val target = loadInventoryMutationTarget(current)
                        ?: return@coroutineScope mutationResult(action, false, "INVENTORY_TARGET_MISSING")
                    val calls = listOf(
                        async { current.adjustInventory(key("inventory-race-a"), inventoryBody(target, 1)) },
                        async { current.adjustInventory(key("inventory-race-b"), inventoryBody(target, 1)) }
                    ).map { it.await() }
                    val successCount = calls.count { it.code() == 200 }
                    val conflictCount = calls.count { it.code() == 409 && it.safeCode() == "REVISION_CONFLICT" }
                    mutationResult(
                        action,
                        successCount == 1 && conflictCount == 1,
                        if (successCount == 1 && conflictCount == 1) "CONCURRENT_CONFLICT_SAFE" else "CONCURRENT_CONFLICT_UNPROVEN"
                    )
                }
                SellerMutationAction.INVENTORY_CROSS_TENANT_DENIAL -> {
                    val target = SellerMutationUatTargets.crossTenant
                        ?: return mutationResult(action, false, "CROSS_TENANT_TARGET_REQUIRED")
                    val body = JsonObject().apply {
                        add("items", com.google.gson.JsonArray().apply {
                            add(JsonObject().apply {
                                addProperty("inventory_item_id", target.inventoryItemId)
                                addProperty("delta", 1)
                                addProperty("reason_code", "android_cross_tenant_uat")
                                addProperty("revision", target.inventoryRevision)
                            })
                        })
                    }
                    expectSafeNotFound(action, current.adjustInventory(key("inventory-cross-tenant"), body))
                }
                SellerMutationAction.ORDER_ALLOWED_TRANSITION -> {
                    val target = loadOrderMutationTarget(current, preferredStatus = "new")
                        ?: return mutationResult(action, false, "ORDER_TARGET_MISSING")
                    val body = JsonObject().apply {
                        addProperty("command", "prepare")
                        addProperty("package_id", target.packageId)
                        addProperty("revision", target.revision)
                    }
                    expectStatus(action, current.orderCommand(target.id, key("order-prepare"), body), setOf(200))
                }
                SellerMutationAction.ORDER_INVALID_TRANSITION -> {
                    val target = loadOrderMutationTarget(current, preferredStatus = "preparing")
                        ?: return mutationResult(action, false, "ORDER_TARGET_MISSING")
                    val body = JsonObject().apply {
                        addProperty("command", "prepare")
                        addProperty("package_id", target.packageId)
                        addProperty("revision", target.revision)
                    }
                    expectStatus(action, current.orderCommand(target.id, key("order-invalid"), body), setOf(409), setOf("INVALID_STATE_TRANSITION"))
                }
                SellerMutationAction.ORDER_STALE_CONFLICT -> {
                    val target = loadOrderMutationTarget(current, preferredStatus = "preparing")
                        ?: return mutationResult(action, false, "ORDER_TARGET_MISSING")
                    if (target.revision <= 1) return mutationResult(action, false, "STALE_REVISION_PRECONDITION_UNPROVEN")
                    val body = JsonObject().apply {
                        addProperty("command", "ship")
                        addProperty("package_id", target.packageId)
                        addProperty("carrier_name", "Yerel UAT")
                        addProperty("tracking_number", "UAT-${target.id}")
                        addProperty("revision", target.revision - 1)
                    }
                    expectStatus(action, current.orderCommand(target.id, key("order-stale"), body), setOf(409), setOf("REVISION_CONFLICT"))
                }
                SellerMutationAction.ORDER_CROSS_TENANT_DENIAL -> {
                    val target = SellerMutationUatTargets.crossTenant
                        ?: return mutationResult(action, false, "CROSS_TENANT_TARGET_REQUIRED")
                    val body = JsonObject().apply {
                        addProperty("command", "prepare")
                        addProperty("package_id", target.orderPackageId)
                        addProperty("revision", target.orderRevision)
                    }
                    expectSafeNotFound(action, current.orderCommand(target.orderId, key("order-cross-tenant"), body))
                }
                SellerMutationAction.SUPPORT_CREATE_AND_SEND -> {
                    val created = createSupportTarget(current, "support-create-send")
                        ?: return mutationResult(action, false, "SUPPORT_CREATE_FAILED")
                    val body = JsonObject().apply {
                        addProperty("conversation_id", created.id)
                        addProperty("body", "Android yerel UAT takip mesajı")
                        addProperty("client_message_id", key("support-client-message"))
                        addProperty("revision", created.revision)
                    }
                    expectStatus(action, current.addSupportMessage(key("support-send"), body), setOf(200))
                }
                SellerMutationAction.SUPPORT_IDEMPOTENT_RETRY -> {
                    val requestKey = key("support-retry")
                    val clientMessageId = key("support-retry-client")
                    val body = JsonObject().apply {
                        addProperty("category", "technical")
                        addProperty("subject", "Android idempotency UAT")
                        addProperty("body", "Yerel sentetik tekrar doğrulaması")
                        addProperty("client_message_id", clientMessageId)
                    }
                    val first = current.createSupportConversation(requestKey, body)
                    val second = current.createSupportConversation(requestKey, body)
                    val reused = second.body()?.asObjectOrNull()?.boolean("reused") == true
                    mutationResult(action, first.code() == 200 && second.code() == 200 && reused, if (reused) "IDEMPOTENT_REPLAY_SAFE" else "IDEMPOTENT_REPLAY_UNPROVEN")
                }
                SellerMutationAction.SUPPORT_CROSS_TENANT_DENIAL -> {
                    val target = SellerMutationUatTargets.crossTenant
                        ?: return mutationResult(action, false, "CROSS_TENANT_TARGET_REQUIRED")
                    expectSafeNotFound(
                        action,
                        current.addSupportMessage(
                            key("support-cross-tenant"),
                            JsonObject().apply {
                                addProperty("conversation_id", target.conversationId)
                                addProperty("body", "Tenant izolasyonu yerel UAT")
                                addProperty("client_message_id", key("support-cross-tenant-client"))
                                addProperty("revision", target.conversationRevision)
                            }
                        )
                    )
                }
                SellerMutationAction.SESSION_LOGOUT_ALL -> {
                    val all = current.logoutAll()
                    val self = current.logout()
                    sessionStore.clear()
                    mutationResult(action, all.code() == 200 && self.code() == 200, if (all.code() == 200 && self.code() == 200) "SESSIONS_REVOKED" else "SESSION_REVOKE_FAILED")
                }
            }
        } catch (_: IOException) {
            mutationResult(action, false, "OFFLINE")
        } catch (_: RuntimeException) {
            mutationResult(action, false, "MALFORMED_RESPONSE")
        }
    }

    suspend fun logout(all: Boolean) {
        try {
            if (api != null && !sessionStore.accessToken.isNullOrBlank()) {
                if (all) {
                    api!!.logoutAll()
                    api!!.logout()
                } else api!!.logout()
            }
        } finally { sessionStore.clear() }
    }

    private suspend fun refreshIfPossible(): Boolean = sessionStore.refreshMutex.withLock {
        val refreshToken = sessionStore.refreshToken ?: return@withLock false
        val current = api ?: return@withLock false
        return@withLock try {
            val response = current.refresh(SellerRefreshRequest(refreshToken))
            val tokens = response.body()
            if (response.isSuccessful && tokens != null) {
                sessionStore.save(tokens)
                true
            } else {
                sessionStore.clear()
                false
            }
        } catch (_: IOException) { false }
    }

    private fun key(prefix: String): String = "android-wave4-$prefix-${UUID.randomUUID()}"

    private fun mutationResult(
        action: SellerMutationAction,
        passed: Boolean,
        code: String
    ): SellerMutationResult = SellerMutationResult(
        action = action,
        passed = passed,
        code = code,
        message = if (passed) "${action.label}: PASS" else "${action.label}: FAIL ($code)"
    )

    private fun expectStatus(
        action: SellerMutationAction,
        response: Response<*>,
        statuses: Set<Int>,
        codes: Set<String> = emptySet()
    ): SellerMutationResult {
        val code = if (response.isSuccessful) "HTTP_${response.code()}" else response.safeCode() ?: "HTTP_${response.code()}"
        val passed = response.code() in statuses && (codes.isEmpty() || code in codes)
        return mutationResult(action, passed, code)
    }

    private fun expectSafeNotFound(action: SellerMutationAction, response: Response<*>): SellerMutationResult =
        expectStatus(action, response, setOf(404), setOf("RESOURCE_NOT_FOUND"))

    private suspend fun loadStoreMutationTarget(current: SellerApi): StoreMutationTarget? {
        val context = current.context()
        if (!context.isSuccessful) return null
        val storeId = context.body()?.storeIds?.singleOrNull() ?: return null
        val store = current.store(storeId)
        val body = store.body().asObjectOrNull() ?: return null
        return StoreMutationTarget(storeId, body.long("revision") ?: return null)
    }

    private suspend fun loadOfferMutationTarget(current: SellerApi): OfferMutationTarget? {
        val response = current.offers()
        if (!response.isSuccessful) return null
        val body = response.body().firstObjectOrNull() ?: return null
        val variant = body.get("variant").asObjectOrNull() ?: return null
        return OfferMutationTarget(
            id = body.long("id") ?: return null,
            revision = body.long("revision") ?: return null,
            sellerSku = variant.text("seller_sku") ?: return null,
            priceMinor = variant.long("price_minor") ?: return null,
            visibility = body.text("visibility") ?: "visible"
        )
    }

    private suspend fun loadInventoryMutationTarget(current: SellerApi): InventoryMutationTarget? {
        val response = current.inventory()
        if (!response.isSuccessful) return null
        val body = response.body().firstObjectOrNull() ?: return null
        return InventoryMutationTarget(
            id = body.long("id") ?: return null,
            quantity = body.long("quantity") ?: return null,
            revision = body.long("revision") ?: return null
        )
    }

    private fun inventoryBody(target: InventoryMutationTarget, delta: Long): JsonObject = JsonObject().apply {
        add("items", com.google.gson.JsonArray().apply {
            add(JsonObject().apply {
                addProperty("inventory_item_id", target.id)
                addProperty("delta", delta)
                addProperty("reason_code", "android_local_uat")
                addProperty("revision", target.revision)
            })
        })
    }

    private suspend fun loadOrderMutationTarget(current: SellerApi, preferredStatus: String): OrderMutationTarget? {
        val response = current.orders()
        if (!response.isSuccessful) return null
        val candidates = response.body().objectList()
        val body = candidates.firstOrNull { it.text("status") == preferredStatus }
            ?: return null
        val packageId = body.get("packages")
            ?.takeIf { it.isJsonArray }
            ?.asJsonArray
            ?.firstOrNull()
            .asObjectOrNull()
            ?.long("id")
            ?: return null
        return OrderMutationTarget(
            id = body.long("id") ?: return null,
            revision = body.long("revision") ?: return null,
            packageId = packageId
        )
    }

    private suspend fun createSupportTarget(current: SellerApi, prefix: String): SupportMutationTarget? {
        val body = JsonObject().apply {
            addProperty("category", "technical")
            addProperty("subject", "Android yerel UAT")
            addProperty("body", "Yalnız sentetik yerel doğrulama")
            addProperty("client_message_id", key("$prefix-client"))
        }
        val response = current.createSupportConversation(key(prefix), body)
        val conversation = response.body().asObjectOrNull()?.get("conversation").asObjectOrNull() ?: return null
        return SupportMutationTarget(
            id = conversation.long("id") ?: return null,
            revision = conversation.long("revision") ?: return null
        )
    }

    private fun page(screen: SellerScreen, body: JsonElement?): SellerUiState {
        if (body == null || body.isJsonNull) return SellerUiState.Empty("Gösterilecek veri yok.")
        val family = when (screen) {
            SellerScreen.PRODUCTS -> SellerOfferListData(body.objectList().mapNotNull { row -> row.toOfferItem() })
            SellerScreen.INVENTORY -> SellerInventoryData(body.objectList().mapNotNull { row -> row.toInventoryItem() })
            SellerScreen.ORDERS -> SellerOrderListData(body.objectList().mapNotNull { row -> row.toOrderItem() })
            SellerScreen.STORE -> body.asObjectOrNull()?.toStoreData()
            SellerScreen.SUPPORT -> SellerSupportData(body.objectList().mapNotNull { row -> row.toSupportConversation() })
            SellerScreen.SECURITY -> SellerSecurityData(body.objectList().mapNotNull { row -> row.toSecuritySession() })
            else -> null
        }
        if (family.isEmptyFamily() && screen !in setOf(SellerScreen.SUPPORT, SellerScreen.SECURITY)) {
            return SellerUiState.Empty("Gösterilecek veri yok.")
        }
        val rows = body.safeRows()
        if (rows.isEmpty() && family == null) return SellerUiState.Empty("Gösterilecek veri yok.")
        return SellerUiState.Content(SellerPage(screen.title, rows, screen, empty = rows.isEmpty(), familyData = family))
    }

    private fun malformedResponse(): SellerUiState = SellerUiState.Error("Sunucu yanıtı güvenle işlenemedi.")

    private fun unauthorizedAfterRefreshFailure(): SellerUiState =
        if (hasPersistedSession()) SellerUiState.Offline("Oturum yenileme isteği tamamlanamadı.")
        else SellerUiState.SessionExpired

    private fun failure(response: Response<*>): SellerUiState {
        val envelope = response.errorBody().safeError()
        return when (response.code()) {
            401 -> {
                val hadSession = hasPersistedSession()
                sessionStore.clear()
                if (hadSession) SellerUiState.SessionExpired else SellerUiState.Unauthorized
            }
            503 -> SellerUiState.Disabled("Bu özellik şu an kullanıma kapalı.")
            403, 404 -> SellerUiState.Error("Bu kaynağa erişim yetkiniz yok.", retryable = false)
            409 -> SellerUiState.Error("Veri değişti. En güncel bilgiyi yeniden yükleyin.")
            else -> SellerUiState.Error(envelope?.code ?: "İşlem şu anda tamamlanamadı.")
        }
    }
}

private data class StoreMutationTarget(val id: Long, val revision: Long)
private data class OfferMutationTarget(
    val id: Long,
    val revision: Long,
    val sellerSku: String,
    val priceMinor: Long,
    val visibility: String
)
private data class InventoryMutationTarget(val id: Long, val quantity: Long, val revision: Long)
private data class OrderMutationTarget(val id: Long, val revision: Long, val packageId: Long)
private data class SupportMutationTarget(val id: Long, val revision: Long)

private fun JsonObject.toOfferItem(): SellerOfferItem? {
    val variant = get("variant").asObjectOrNull() ?: return null
    val inventory = get("inventory").asObjectOrNull() ?: return null
    return SellerOfferItem(
        id = long("id") ?: return null,
        sellerSku = variant.text("seller_sku") ?: return null,
        priceMinor = variant.long("price_minor") ?: 0,
        currency = variant.text("currency") ?: "TRY",
        quantity = inventory.long("quantity") ?: 0,
        status = text("status") ?: "draft",
        visibility = text("visibility") ?: "hidden",
        revision = long("revision") ?: 1
    )
}

private fun JsonObject.toInventoryItem(): SellerInventoryItem? = SellerInventoryItem(
    id = long("id") ?: return null,
    sellerSku = text("seller_sku") ?: return null,
    priceMinor = long("price_minor") ?: 0,
    currency = text("currency") ?: "TRY",
    quantity = long("quantity") ?: 0,
    lowStockThreshold = long("low_stock_threshold") ?: 0,
    revision = long("revision") ?: 1
)

private fun JsonObject.toOrderItem(): SellerOrderItem? = SellerOrderItem(
    id = long("id") ?: return null,
    status = text("status") ?: "new",
    currency = text("currency") ?: "TRY",
    grossMinor = long("gross_minor") ?: 0,
    revision = long("revision") ?: 1,
    packageCount = get("packages").objectList().size
)

private fun JsonObject.toStoreData(): SellerStoreData? = SellerStoreData(
    id = long("id") ?: return null,
    displayName = text("display_name") ?: return null,
    description = text("description").orEmpty(),
    operationalStatus = text("operational_status") ?: "open",
    revision = long("revision") ?: 1
)

private fun JsonObject.toSupportConversation(): SellerSupportConversation? = SellerSupportConversation(
    id = long("id") ?: return null,
    category = text("category") ?: "support",
    subject = text("subject") ?: "Destek konuşması",
    status = text("status") ?: "open",
    revision = long("revision") ?: 1,
    messageCount = get("messages").objectList().size
)

private fun JsonObject.toSecuritySession(): SellerSecuritySession? = SellerSecuritySession(
    id = text("id") ?: return null,
    current = boolean("current") ?: false,
    expiresAt = text("expires_at") ?: ""
)

private fun SellerFamilyData?.isEmptyFamily(): Boolean = when (this) {
    is SellerOfferListData -> items.isEmpty()
    is SellerInventoryData -> items.isEmpty()
    is SellerOrderListData -> items.isEmpty()
    is SellerSupportData -> conversations.isEmpty()
    is SellerSecurityData -> sessions.isEmpty()
    else -> false
}

private fun JsonElement?.asObjectOrNull(): JsonObject? = this
    ?.takeIf { it.isJsonObject }
    ?.asJsonObject

private fun JsonElement?.objectList(): List<JsonObject> = when {
    this == null || isJsonNull -> emptyList()
    isJsonArray -> asJsonArray.mapNotNull { it.asObjectOrNull() }
    isJsonObject -> listOf(asJsonObject)
    else -> emptyList()
}

private fun JsonElement?.firstObjectOrNull(): JsonObject? = objectList().firstOrNull()

private fun JsonObject.long(name: String): Long? = get(name).strictLongOrNull()

internal fun JsonElement?.strictLongOrNull(): Long? {
    val primitive = this
        ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }
        ?.asJsonPrimitive
        ?: return null
    return runCatching {
        val integer = primitive.asString.toBigDecimal().toBigIntegerExact()
        if (integer < BigInteger.valueOf(Long.MIN_VALUE) || integer > BigInteger.valueOf(Long.MAX_VALUE)) {
            null
        } else {
            integer.toLong()
        }
    }.getOrNull()
}

private fun JsonObject.boolean(name: String): Boolean? = get(name)
    ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isBoolean }
    ?.asBoolean

private fun Response<*>.safeCode(): String? = errorBody().safeError()?.code

private class AuthorizationInterceptor(private val sessionStore: SellerSessionStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): okhttp3.Response {
        val token = sessionStore.accessToken
        val request = if (token.isNullOrBlank()) chain.request() else chain.request().newBuilder()
            .header("Authorization", "Bearer $token")
            .header("Cache-Control", "no-store")
            .build()
        return chain.proceed(request)
    }
}

private fun ResponseBody?.safeError(): SellerErrorEnvelope? = runCatching {
    val raw = this?.string().orEmpty()
    if (raw.isBlank()) null else Gson().fromJson(raw, SellerErrorEnvelope::class.java)
}.getOrNull()

private fun JsonElement?.roleCode(): String? = this
    ?.takeIf { it.isJsonObject }
    ?.asJsonObject
    ?.getAsJsonArray("roles")
    ?.firstOrNull()
    ?.takeIf { it.isJsonObject }
    ?.asJsonObject
    ?.text("code")

private fun JsonElement?.teamMembers(): List<SellerTeamMember>? {
    val members = this
        ?.takeIf { it.isJsonObject }
        ?.asJsonObject
        ?.getAsJsonArray("members")
        ?: return null
    return members.map { value ->
        val member = value.takeIf { it.isJsonObject }?.asJsonObject ?: return null
        val id = member.get("id")?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asLong ?: return null
        SellerTeamMember(
            id = id,
            displayName = member.text("display_name"),
            roleCode = member.text("role_code") ?: return null,
            status = member.text("status") ?: return null
        )
    }
}

private fun JsonObject.text(name: String): String? = get(name)
    ?.takeIf { it.isJsonPrimitive }
    ?.asString
    ?.trim()
    ?.takeIf { it.isNotBlank() }
