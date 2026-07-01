package com.novastore.app.data.model

import com.google.gson.annotations.SerializedName
import kotlinx.serialization.Serializable

@Serializable
data class Category(
    val id: Int = 0,
    val name: String = "",
    val slug: String = "",
    @SerializedName("parent_id") val parentId: Int? = null,
    val children: List<Category> = emptyList(),
    val depth: Int = 0,
    val path: String = "",
    @SerializedName("image_url") val imageUrl: String? = null,
    @SerializedName("banner_url") val bannerUrl: String? = null,
    val icon: String? = null,
    @SerializedName("accent_color") val accentColor: String? = null,
    val description: String? = null,
    @SerializedName("sort_order") val sortOrder: Int = 0,
    @SerializedName("visible_product_count") val visibleProductCount: Int = 0,
    @SerializedName("sellable_product_count") val sellableProductCount: Int = 0,
    @SerializedName("subtree_visible_product_count") val subtreeVisibleProductCount: Int = 0,
    @SerializedName("subtree_sellable_product_count") val subtreeSellableProductCount: Int = 0
)

fun List<Category>.flattenCategoryTree(): List<Category> = flatMap { category ->
    listOf(category) + category.children.flattenCategoryTree()
}

fun List<Category>.findCategoryTrail(slug: String?): List<Category> {
    if (slug.isNullOrBlank()) return emptyList()

    fun find(nodes: List<Category>, trail: List<Category>): List<Category>? {
        nodes.forEach { category ->
            val nextTrail = trail + category
            if (category.slug == slug) return nextTrail
            find(category.children, nextTrail)?.let { return it }
        }
        return null
    }

    return find(this, emptyList()).orEmpty()
}
