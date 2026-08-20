package com.novastore.seller.data

import com.google.gson.JsonElement
import com.google.gson.annotations.SerializedName

data class SellerLoginRequest(
    val identifier: String,
    val password: String,
    @SerializedName("organization_id") val organizationId: Long? = null
)

data class SellerRefreshRequest(@SerializedName("refresh_token") val refreshToken: String)

data class SellerTokenResponse(
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("refresh_token") val refreshToken: String,
    @SerializedName("token_type") val tokenType: String,
    @SerializedName("expires_in") val expiresIn: Long,
    @SerializedName("session_id") val sessionId: String,
    val organization: SellerOrganization? = null
)

data class SellerOrganization(
    val id: Long,
    @SerializedName("display_name") val displayName: String
)

data class SellerContextResponse(
    val organization: SellerOrganization,
    @SerializedName("store_ids") val storeIds: List<Long> = emptyList(),
    @SerializedName("selection_required") val selectionRequired: Boolean = false
)

data class SellerErrorEnvelope(val code: String? = null, val error: String? = null)

data class SellerPage(
    val title: String,
    val rows: List<Pair<String, String>>,
    val screen: SellerScreen,
    val empty: Boolean = false,
    val unavailable: Boolean = false,
    val team: SellerTeamPage? = null,
    val familyData: SellerFamilyData? = null,
    val canonicalFixtureId: String? = null,
    val canonicalReferenceId: String? = null,
    val mutationNotice: String? = null,
    val source: SellerPageSource = SellerPageSource.API
)

enum class SellerPageSource { API, CANONICAL_FIXTURE }

enum class SellerMutationAction(val label: String) {
    STORE_UPDATE("Mağaza güncellemesi"),
    STORE_PROTECTED_FIELD_DENIAL("Korumalı mağaza alanı reddi"),
    STORE_CROSS_TENANT_DENIAL("Yabancı mağaza güncelleme reddi"),
    OFFER_UPDATE("Teklif güncellemesi"),
    OFFER_PROTECTED_FIELD_DENIAL("Kanonik katalog alanı reddi"),
    OFFER_CROSS_TENANT_DENIAL("Yabancı teklif güncelleme reddi"),
    INVENTORY_UPDATE("Stok güncellemesi"),
    INVENTORY_NEGATIVE_DENIAL("Negatif stok reddi"),
    INVENTORY_STALE_CONFLICT("Eski stok revizyonu çatışması"),
    INVENTORY_CONCURRENT_CONFLICT("Eşzamanlı stok çatışması"),
    INVENTORY_CROSS_TENANT_DENIAL("Yabancı stok güncelleme reddi"),
    ORDER_ALLOWED_TRANSITION("İzinli sipariş geçişi"),
    ORDER_INVALID_TRANSITION("Geçersiz sipariş geçişi"),
    ORDER_STALE_CONFLICT("Eski sipariş revizyonu çatışması"),
    ORDER_CROSS_TENANT_DENIAL("Yabancı sipariş komutu reddi"),
    SUPPORT_CREATE_AND_SEND("Destek konuşması ve mesajı"),
    SUPPORT_IDEMPOTENT_RETRY("Destek idempotent tekrarı"),
    SUPPORT_CROSS_TENANT_DENIAL("Destek tenant reddi"),
    SESSION_LOGOUT_ALL("Tüm seller oturumlarını kapatma")
}

data class SellerMutationResult(
    val action: SellerMutationAction,
    val passed: Boolean,
    val code: String,
    val message: String
)

internal object SellerMutationUatTargets {
    @Volatile
    var crossTenant: SellerCrossTenantMutationTargets? = null
}

internal data class SellerCrossTenantMutationTargets(
    val storeId: Long,
    val storeRevision: Long,
    val offerId: Long,
    val offerRevision: Long,
    val inventoryItemId: Long,
    val inventoryRevision: Long,
    val orderId: Long,
    val orderRevision: Long,
    val orderPackageId: Long,
    val conversationId: Long,
    val conversationRevision: Long
)

sealed interface SellerFamilyData

data class SellerDashboardData(
    val storeName: String,
    val currency: String,
    val grossMinor: Long,
    val availableMinor: Long,
    val lowStockCount: Int,
    val ordersByStatus: List<Pair<String, Int>>
) : SellerFamilyData

data class SellerOfferItem(
    val id: Long,
    val sellerSku: String,
    val priceMinor: Long,
    val currency: String,
    val quantity: Long,
    val status: String,
    val visibility: String,
    val revision: Long
)

data class SellerOfferListData(val items: List<SellerOfferItem>) : SellerFamilyData

data class SellerInventoryItem(
    val id: Long,
    val sellerSku: String,
    val priceMinor: Long,
    val currency: String,
    val quantity: Long,
    val lowStockThreshold: Long,
    val revision: Long
)

data class SellerInventoryData(val items: List<SellerInventoryItem>) : SellerFamilyData

data class SellerOrderItem(
    val id: Long,
    val status: String,
    val currency: String,
    val grossMinor: Long,
    val revision: Long,
    val packageCount: Int
)

data class SellerOrderListData(val items: List<SellerOrderItem>) : SellerFamilyData

data class SellerFinanceLedgerItem(
    val id: Long,
    val entryType: String,
    val amountMinor: Long,
    val currency: String
)

data class SellerFinanceData(
    val currency: String,
    val grossMinor: Long,
    val commissionMinor: Long,
    val refundMinor: Long,
    val netReceivableMinor: Long,
    val availableMinor: Long,
    val ledger: List<SellerFinanceLedgerItem>
) : SellerFamilyData

data class SellerStoreData(
    val id: Long,
    val displayName: String,
    val description: String,
    val operationalStatus: String,
    val revision: Long
) : SellerFamilyData

data class SellerSupportConversation(
    val id: Long,
    val category: String,
    val subject: String,
    val status: String,
    val revision: Long,
    val messageCount: Int
)

data class SellerSupportData(val conversations: List<SellerSupportConversation>) : SellerFamilyData

data class SellerSecuritySession(
    val id: String,
    val current: Boolean,
    val expiresAt: String
)

data class SellerSecurityData(val sessions: List<SellerSecuritySession>) : SellerFamilyData

data class SellerTeamMember(
    val id: Long,
    val displayName: String?,
    val roleCode: String,
    val status: String
)

data class SellerTeamPage(
    val storeName: String,
    val sessionRoleCode: String,
    val members: List<SellerTeamMember>
)

sealed interface SellerUiState {
    data object Loading : SellerUiState
    data class Content(val page: SellerPage) : SellerUiState
    data class Empty(val message: String) : SellerUiState
    data class Error(val message: String, val retryable: Boolean = true) : SellerUiState
    data class Offline(val message: String) : SellerUiState
    data object Unauthorized : SellerUiState
    data object SessionExpired : SellerUiState
    data class Disabled(val message: String) : SellerUiState
}

enum class SellerTab(val title: String) {
    DASHBOARD("Genel Bakış"),
    PRODUCTS("Ürünler"),
    ORDERS("Siparişler"),
    FINANCE("Finans"),
    STORE("Mağazam")
}

enum class SellerScreen(val title: String, val tab: SellerTab? = null) {
    DASHBOARD("Genel Bakış", SellerTab.DASHBOARD),
    ONBOARDING("Kurulum Özeti"),
    PRODUCTS("Ürünler", SellerTab.PRODUCTS),
    INVENTORY("Stok", SellerTab.PRODUCTS),
    ORDERS("Siparişler", SellerTab.ORDERS),
    ORDER_DETAIL("Sipariş Detayı", SellerTab.ORDERS),
    FINANCE("Finans", SellerTab.FINANCE),
    ANALYTICS("Analitik", SellerTab.DASHBOARD),
    CAMPAIGNS("Kampanyalar", SellerTab.STORE),
    NOTIFICATIONS("Bildirim Merkezi", SellerTab.DASHBOARD),
    STORE("Mağazam", SellerTab.STORE),
    CONTEXT("Mağaza bağlamı", SellerTab.STORE),
    TEAM("Ekip ve yetkiler", SellerTab.STORE),
    CUSTOMER_MESSAGES("Müşteri Mesajları", SellerTab.DASHBOARD),
    SUPPORT("Satıcı desteği", SellerTab.DASHBOARD),
    SECURITY("Hesap ve güvenlik", SellerTab.STORE);

    companion object {
        fun fromTab(tab: SellerTab): SellerScreen = when (tab) {
            SellerTab.DASHBOARD -> DASHBOARD
            SellerTab.PRODUCTS -> PRODUCTS
            SellerTab.ORDERS -> ORDERS
            SellerTab.FINANCE -> FINANCE
            SellerTab.STORE -> STORE
        }
    }
}

fun JsonElement?.safeText(): String = when {
    this == null || isJsonNull -> "—"
    isJsonPrimitive -> asJsonPrimitive.toString().trim('"')
    else -> "Mevcut"
}

private val sensitiveDisplayField = Regex(
    "email|phone|address|name|message|body|token|secret|password|credential|customer|buyer|recipient",
    RegexOption.IGNORE_CASE
)

fun JsonElement?.safeRows(): List<Pair<String, String>> = when {
    this == null || isJsonNull -> emptyList()
    isJsonObject -> asJsonObject.entrySet()
        .asSequence()
        .filterNot { (key, _) -> sensitiveDisplayField.containsMatchIn(key) }
        .take(8)
        .map { (key, value) ->
            key.replace('_', ' ').replaceFirstChar { it.uppercase() } to value.safeText()
        }
        .toList()
    isJsonArray -> asJsonArray.take(8).mapIndexed { index, _ -> "Kayıt ${index + 1}" to "Mevcut" }
    else -> listOf("Durum" to "Mevcut")
}
