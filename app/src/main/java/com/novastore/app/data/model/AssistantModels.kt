package com.novastore.app.data.model

import com.google.gson.annotations.SerializedName

data class AssistantChatRequest(
    val message: String,
    val history: List<AssistantHistoryItem> = emptyList(),
    val context: AssistantContext = AssistantContext()
)

data class AssistantHistoryItem(
    val role: String,
    val message: String
)

data class AssistantContext(
    val page: String = "android_support",
    val title: String = "NovaStore Android Destek",
    val productId: Int? = null,
    val selectedMode: String = "friendly",
    val lastProductIds: List<Int> = emptyList(),
    val pendingAction: AssistantPendingAction? = null
)

data class AssistantChatResponse(
    val reply: String?,
    val message: String? = null,
    val mode: String? = null,
    val modeLabel: String? = null,
    val availableModes: List<AssistantModeOption> = emptyList(),
    val suggestions: List<String> = emptyList(),
    val products: List<AssistantProduct> = emptyList(),
    val cards: List<AssistantCard> = emptyList(),
    val comparison: AssistantComparison? = null,
    val allowEscalation: Boolean = false,
    val requiresConfirmation: Boolean = false,
    val pendingAction: AssistantPendingAction? = null
)

data class AssistantModeOption(
    val id: String?,
    val title: String?,
    val description: String?
)

data class AssistantProduct(
    val id: Int?,
    val name: String?,
    val price: Double?,
    val stock: Int?,
    val category: String?,
    @SerializedName("oldPrice") val oldPrice: Double?,
    @SerializedName("imageUrl") val imageUrl: String?,
    @SerializedName("productUrl") val productUrl: String?,
    @SerializedName("averageRating") val averageRating: Double? = null,
    @SerializedName("reviewCount") val reviewCount: Int? = null
)

data class AssistantCard(
    val type: String?,
    val productId: Int?,
    val title: String?,
    val imageUrl: String?,
    val price: Double?,
    val oldPrice: Double?,
    val currency: String?,
    val inStock: Boolean?,
    val stock: Int?,
    val rating: Double?,
    val reviewCount: Int?,
    val category: String?,
    val actions: List<String> = emptyList()
) {
    fun toProduct(): AssistantProduct = AssistantProduct(
        id = productId,
        name = title,
        price = price,
        stock = stock,
        category = category,
        oldPrice = oldPrice,
        imageUrl = imageUrl,
        productUrl = null,
        averageRating = rating,
        reviewCount = reviewCount
    )
}

data class AssistantComparison(
    val rows: List<AssistantComparisonRow> = emptyList()
)

data class AssistantComparisonRow(
    val productId: Int?,
    val title: String?,
    val price: Double?,
    val brand: String?,
    val stock: Int?,
    val warranty: String?,
    val rating: Double?,
    val pros: List<String> = emptyList(),
    val cons: List<String> = emptyList(),
    val bestFor: String?
)

data class AssistantPendingAction(
    val type: String?,
    val productId: Int? = null,
    val quantity: Int? = null,
    val reason: String? = null
)

data class AssistantEscalationRequest(
    val summary: String
)

data class AssistantEscalationResponse(
    val message: String?,
    val escalation: AssistantEscalationMessage?
)

data class AssistantEscalationMessage(
    val id: Int?,
    val message: String?,
    @SerializedName("created_at") val createdAt: String?
)
