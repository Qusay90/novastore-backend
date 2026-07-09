package com.novastore.app

import com.google.gson.Gson
import com.novastore.app.data.model.Category
import com.novastore.app.data.model.Product
import com.novastore.app.data.model.ProductCategoryRelation
import com.novastore.app.data.model.findCategoryPath
import com.novastore.app.data.model.flattenCategoryTree
import com.novastore.app.data.model.matchesCategorySelection
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CategoryV2AndroidLogicTest {
    @Test
    fun categoryTreeParsesCanonicalPathAndChildren() {
        val categories = Gson().fromJson(
            """
            [
              {
                "id": 1,
                "name": "Kadın",
                "slug": "kadin",
                "path": "kadin",
                "visibleProductCount": 3,
                "children": [
                  {
                    "id": 2,
                    "name": "Giyim",
                    "slug": "giyim",
                    "path": "kadin/giyim",
                    "visibleProductCount": 2
                  }
                ]
              }
            ]
            """.trimIndent(),
            Array<Category>::class.java
        ).toList()

        assertEquals("kadin", categories.first().categoryKey)
        assertEquals("kadin/giyim", categories.first().children.first().categoryKey)
        assertEquals(listOf("Kadın", "Giyim"), categories.findCategoryPath(2).map { it.name })
        assertEquals(listOf("Kadın", "Giyim"), categories.flattenCategoryTree().map { it.name })
        assertEquals("Kadın (3)", categories.first().displayNameWithCount)
    }

    @Test
    fun categoryParserKeepsLegacyFullSlugPathOnlyAsFallback() {
        val category = Gson().fromJson(
            """
            {
              "id": 7,
              "name": "Aksesuar",
              "full_slug_path": "eski/aksesuar",
              "slug": "aksesuar"
            }
            """.trimIndent(),
            Category::class.java
        )

        assertEquals("eski/aksesuar", category.categoryKey)
    }

    @Test
    fun productCategoryRelationMatchesDescendantPath() {
        val selected = Category(id = 1, name = "Kadın", path = "kadin")
        val product = testProduct(
            id = 9,
            name = "Elbise",
            categoryRelations = listOf(
                ProductCategoryRelation(
                    categoryId = 2,
                    category = Category(id = 2, name = "Elbise", path = "kadin/giyim/elbise")
                )
            )
        )

        assertTrue(product.matchesCategorySelection(selected, includeDescendants = true))
        assertFalse(product.matchesCategorySelection(selected, includeDescendants = false))
    }

    @Test
    fun productCategorySelectionKeepsLegacyNameFallback() {
        val selected = Category(id = 4, name = "Elektronik", path = "elektronik")
        val product = testProduct(
            id = 12,
            name = "Kulaklık",
            category = "Elektronik",
            categories = listOf("Aksesuar")
        )

        assertTrue(product.matchesCategorySelection(selected))
    }

    @Test
    fun apiAndRepositoryUsePublicTreeAndDescendantQueryContract() {
        val apiSource = readProjectFile("app/src/main/java/com/novastore/app/core/network/NovaStoreApi.kt")
        val repositorySource = readProjectFile("app/src/main/java/com/novastore/app/data/repository/ProductRepository.kt")

        assertTrue(apiSource.contains("@GET(\"api/public/categories\")"))
        assertTrue(apiSource.contains("@Query(\"format\") format: String = \"tree\""))
        assertTrue(apiSource.contains("@Query(\"category\") category: String? = null"))
        assertTrue(apiSource.contains("@Query(\"includeDescendants\") includeDescendants: Boolean? = null"))
        assertFalse(apiSource.contains("api/categories/public-tree"))
        assertTrue(repositorySource.contains("api.getProducts(category = categoryKey, includeDescendants = includeDescendants)"))
    }

    private fun readProjectFile(path: String): String {
        val candidates = listOf(
            File(path),
            File("..", path)
        )
        return candidates.first { it.exists() }.readText()
    }

    private fun testProduct(
        id: Int,
        name: String,
        category: String = "Genel",
        categories: List<String> = emptyList(),
        categoryRelations: List<ProductCategoryRelation> = emptyList()
    ): Product = Product(
        id = id,
        name = name,
        price = 100.0,
        oldPrice = null,
        stock = 5,
        description = null,
        imageUrl = null,
        category = category,
        categories = categories,
        averageRating = "0.0",
        reviewCount = 0,
        media = emptyList(),
        categoryRelations = categoryRelations
    )
}
