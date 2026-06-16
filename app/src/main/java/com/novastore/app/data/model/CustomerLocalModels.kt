package com.novastore.app.data.model

data class CustomerAddress(
    val id: Long,
    val title: String,
    val fullName: String,
    val phone: String,
    val city: String,
    val district: String,
    val detail: String,
    val isDefault: Boolean = false
) {
    val singleLine: String
        get() = listOf(detail, district, city)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .joinToString(", ")
}

data class FavoriteProduct(
    val id: Int,
    val name: String? = null,
    val price: Double? = null,
    val oldPrice: Double? = null,
    val imageUrl: String? = null,
    val stock: Int? = null,
    val category: String? = null
)

data class FavoriteEntry(
    val productId: Int,
    val createdAt: String? = null,
    val product: FavoriteProduct? = null
)

data class FavoritesResponse(
    val productIds: List<Int>? = null,
    val favorites: List<FavoriteEntry>? = null
) {
    val normalizedProductIds: Set<Int>
        get() {
            val ids = productIds.orEmpty().ifEmpty {
                favorites.orEmpty().map { it.productId }
            }
            return ids.filter { it > 0 }.toSet()
        }
}

data class FavoriteSyncRequest(
    val productIds: List<Int>
)

data class FavoriteMutationResponse(
    val productId: Int,
    val favorited: Boolean,
    val created: Boolean? = null,
    val removed: Boolean? = null,
    val localOnly: Boolean? = null
)
