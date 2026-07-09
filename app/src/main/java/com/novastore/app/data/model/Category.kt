package com.novastore.app.data.model

import com.google.gson.annotations.SerializedName
import kotlinx.serialization.Serializable

@Serializable
data class Category(
    val id: Int = 0,
    val name: String = "",
    @SerializedName(value = "parentId", alternate = ["parent_id"]) val parentId: Int? = null,
    val slug: String? = null,
    val path: String? = null,
    @SerializedName(value = "fullSlugPath", alternate = ["full_slug_path"]) val legacyFullSlugPath: String? = null,
    val depth: Int = 0,
    @SerializedName(value = "displayOrder", alternate = ["display_order", "sort_order"]) val displayOrder: Int = 0,
    val children: List<Category> = emptyList(),
    @SerializedName(value = "visibleProductCount", alternate = ["visible_product_count", "subtree_visible_product_count"]) val visibleProductCount: Int = 0,
    @SerializedName(value = "directVisibleProductCount", alternate = ["direct_visible_product_count"]) val directVisibleProductCount: Int = 0,
    @SerializedName(value = "isActive", alternate = ["is_active"]) val isActive: Boolean = true
) {
    val categoryKey: String
        get() = path?.trim()?.takeIf { it.isNotEmpty() }
            ?: legacyFullSlugPath?.trim()?.takeIf { it.isNotEmpty() }
            ?: slug?.trim()?.takeIf { it.isNotEmpty() }
            ?: name

    val displayNameWithCount: String
        get() = if (visibleProductCount > 0) "$name ($visibleProductCount)" else name
}

fun List<Category>.flattenCategoryTree(): List<Category> {
    val rows = mutableListOf<Category>()

    fun visit(category: Category) {
        rows += category
        category.children.forEach(::visit)
    }

    forEach(::visit)
    return rows
}

fun List<Category>.findCategoryPath(targetId: Int): List<Category> {
    fun visit(category: Category, trail: List<Category>): List<Category>? {
        val nextTrail = trail + category
        if (category.id == targetId) return nextTrail

        category.children.forEach { child ->
            visit(child, nextTrail)?.let { return it }
        }
        return null
    }

    forEach { category ->
        visit(category, emptyList())?.let { return it }
    }
    return emptyList()
}
