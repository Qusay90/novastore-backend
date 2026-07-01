package com.novastore.app

import com.google.gson.Gson
import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.data.model.Category
import com.novastore.app.data.model.Product
import com.novastore.app.data.model.findCategoryTrail
import com.novastore.app.data.model.flattenCategoryTree
import com.novastore.app.feature.home.HomeUiState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.http.GET
import retrofit2.http.Query

class CategoryV2Test {

    @Test
    fun publicCategoryTreeParsesRecursivelyAndKeepsStockIndependentCounts() {
        val json = """
            [
              {
                "id": 1,
                "name": "Elektronik",
                "slug": "elektronik",
                "parent_id": null,
                "depth": 0,
                "path": "elektronik",
                "visible_product_count": 0,
                "sellable_product_count": 0,
                "subtree_visible_product_count": 1,
                "subtree_sellable_product_count": 0,
                "children": [
                  {
                    "id": 2,
                    "name": "Bilgisayar",
                    "slug": "bilgisayar",
                    "parent_id": 1,
                    "depth": 1,
                    "path": "elektronik/bilgisayar",
                    "visible_product_count": 1,
                    "sellable_product_count": 0,
                    "subtree_visible_product_count": 1,
                    "subtree_sellable_product_count": 0,
                    "children": [
                      {
                        "id": 3,
                        "name": "Dizüstü",
                        "slug": "dizustu",
                        "parent_id": 2,
                        "depth": 2,
                        "path": "elektronik/bilgisayar/dizustu",
                        "visible_product_count": 1,
                        "sellable_product_count": 0,
                        "subtree_visible_product_count": 1,
                        "subtree_sellable_product_count": 0,
                        "children": []
                      }
                    ]
                  }
                ]
              }
            ]
        """.trimIndent()

        val categories = Gson().fromJson(json, Array<Category>::class.java).toList()

        assertEquals(listOf("elektronik", "bilgisayar", "dizustu"), categories.flattenCategoryTree().map { it.slug })
        assertEquals(listOf("Elektronik", "Bilgisayar", "Dizüstü"), categories.findCategoryTrail("dizustu").map { it.name })
        assertEquals(1, categories.first().subtreeVisibleProductCount)
        assertEquals(0, categories.first().subtreeSellableProductCount)
    }

    @Test
    fun legacyCategoryCacheShapeUsesSafeDefaults() {
        val category = Gson().fromJson(
            """{"id":7,"name":"Legacy","parent_id":null}""",
            Category::class.java
        )

        assertEquals("", category.slug)
        assertEquals(emptyList<Category>(), category.children)
        assertEquals(0, category.subtreeVisibleProductCount)
    }

    @Test
    fun retrofitUsesPublicTreeAndSlugOrIdProductQueries() {
        val categoryMethod = NovaStoreApi::class.java.declaredMethods.first { it.name == "getCategories" }
        assertEquals("api/public/categories", categoryMethod.getAnnotation(GET::class.java)?.value)

        val productMethod = NovaStoreApi::class.java.declaredMethods.first { it.name == "getProducts" }
        val queryNames = productMethod.parameterAnnotations
            .flatMap { annotations -> annotations.filterIsInstance<Query>() }
            .map { it.value }

        assertTrue(queryNames.contains("categorySlug"))
        assertTrue(queryNames.contains("categoryId"))
    }

    @Test
    fun soldOutProductsRemainVisibleButSortAfterPurchasableProducts() {
        val soldOut = product(id = 1, stock = 0)
        val available = product(id = 2, stock = 4)
        val products = HomeUiState(
            isLoading = false,
            products = listOf(soldOut, available)
        ).filteredProducts

        assertEquals(listOf(2, 1), products.map { it.id })
        assertTrue(products.any { it.id == soldOut.id })
        assertFalse(products.first().stock <= 0)
    }

    private fun product(id: Int, stock: Int) = Product(
        id = id,
        name = "Ürün $id",
        price = 100.0,
        oldPrice = null,
        stock = stock,
        description = null,
        imageUrl = null,
        category = "Legacy",
        categories = listOf("Legacy"),
        averageRating = "0",
        reviewCount = 0,
        media = emptyList()
    )
}
