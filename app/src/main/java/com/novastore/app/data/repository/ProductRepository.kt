package com.novastore.app.data.repository

import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.data.model.AskQuestionRequest
import com.novastore.app.data.model.Category
import com.novastore.app.data.model.Product
import com.novastore.app.data.model.matchesCategorySelection
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProductRepository @Inject constructor(
    private val api: NovaStoreApi
) {
    private val mutex = Mutex()
    private var cachedProducts: List<Product>? = null
    private var cachedCategories: List<Category>? = null

    suspend fun getProducts(forceRefresh: Boolean = false): Result<List<Product>> = runCatching {
        mutex.withLock {
            if (!forceRefresh) {
                cachedProducts?.let { return@runCatching it }
            }

            api.getProducts().also { cachedProducts = it }
        }
    }

    suspend fun getProductsByCategory(
        category: Category,
        includeDescendants: Boolean = true,
        forceRefresh: Boolean = false
    ): Result<List<Product>> {
        val categoryKey = category.categoryKey.trim()
        if (categoryKey.isBlank()) return getProducts(forceRefresh)

        return runCatching {
            api.getProducts(category = categoryKey, includeDescendants = includeDescendants)
                .also { cachedProducts = it }
        }.recoverCatching { error ->
            cachedProducts?.filter { it.matchesCategorySelection(category, includeDescendants) }
                ?: throw error
        }
    }

    suspend fun getProduct(id: Int): Result<Product> = runCatching {
        cachedProducts?.firstOrNull { it.id == id }?.let { return@runCatching it }
        api.getProduct(id)
    }

    suspend fun getCategories(forceRefresh: Boolean = false): Result<List<Category>> = runCatching {
        mutex.withLock {
            if (!forceRefresh) {
                cachedCategories?.let { return@runCatching it }
            }

            api.getCategories(format = "tree").also { cachedCategories = it }
        }
    }

    suspend fun askProductQuestion(productId: Int, question: String) = runCatching {
        api.askProductQuestion(AskQuestionRequest(productId = productId, question = question))
    }

    suspend fun getProductQuestions(productId: Int) = runCatching {
        api.getProductQuestions(productId)
    }
}
