package com.novastore.app.data.model

import com.google.gson.annotations.SerializedName
import kotlinx.serialization.Serializable

@Serializable
data class Product(
    val id: Int,
    val name: String,
    val price: Double,
    @SerializedName("old_price") val oldPrice: Double?,
    val stock: Int,
    val description: String?,
    @SerializedName("image_url") val imageUrl: String?,
    val category: String,
    val categories: List<String>,
    @SerializedName("average_rating") val averageRating: String,
    @SerializedName("review_count") val reviewCount: Int,
    val media: List<ProductMedia>,
    @SerializedName(value = "categoryRelations", alternate = ["category_relations"]) val categoryRelations: List<ProductCategoryRelation> = emptyList()
) {
    // Computed property to calculate discount percentage
    val discountPercentage: Int
        get() {
            if (oldPrice == null || oldPrice <= price) return 0
            return (((oldPrice - price) / oldPrice) * 100).toInt()
        }
}

@Serializable
data class ProductCategoryRelation(
    @SerializedName(value = "categoryId", alternate = ["category_id"]) val categoryId: Int = 0,
    @SerializedName(value = "isPrimary", alternate = ["is_primary"]) val isPrimary: Boolean = false,
    val category: Category? = null
)

private fun String.normalizedCategoryText(): String =
    trim().lowercase(java.util.Locale("tr", "TR"))

private fun String.normalizedCategoryPath(): String =
    trim().trim('/').lowercase(java.util.Locale("tr", "TR"))

fun Product.matchesCategorySelection(selectedCategory: Category, includeDescendants: Boolean = true): Boolean {
    val targetPath = selectedCategory.categoryKey.normalizedCategoryPath()
    val targetName = selectedCategory.name.normalizedCategoryText()

    if (targetPath.isNotEmpty()) {
        val relationMatches = categoryRelations.any { relation ->
            val relationPath = relation.category?.categoryKey?.normalizedCategoryPath().orEmpty()
            relationPath == targetPath || (includeDescendants && relationPath.startsWith("$targetPath/"))
        }
        if (relationMatches) return true
    }

    val legacyNames = buildList {
        add(this@matchesCategorySelection.category)
        categories.forEach(::add)
    }.map { it.normalizedCategoryText() }

    return targetName.isNotEmpty() && legacyNames.any { it == targetName }
}

@Serializable
data class ProductMedia(
    val id: Int,
    @SerializedName("product_id") val productId: Int,
    @SerializedName("media_url") val mediaUrl: String,
    @SerializedName("is_main") val isMain: Boolean,
    @SerializedName("sort_order") val sortOrder: Int
)

data class AskQuestionRequest(
    @SerializedName("product_id") val productId: Int,
    val question: String
)

data class ProductQuestion(
    val id: Int,
    @SerializedName("product_id") val productId: Int?,
    @SerializedName("user_id") val userId: Int?,
    val question: String,
    val answer: String?,
    @SerializedName("created_at") val createdAt: String?,
    @SerializedName("answered_at") val answeredAt: String?,
    @SerializedName("user_name") val userName: String?,
    @SerializedName("product_name") val productName: String?,
    @SerializedName("product_image") val productImage: String?,
    val status: String?,
    @SerializedName("is_answered") val isAnswered: Boolean?
)
