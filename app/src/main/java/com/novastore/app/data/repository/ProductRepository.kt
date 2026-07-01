package com.novastore.app.data.repository

import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.data.model.AskQuestionRequest
import com.novastore.app.data.model.Category
import com.novastore.app.data.model.Product
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProductRepository @Inject constructor(
    private val api: NovaStoreApi
) {
    private val mutex = Mutex()
    private val cachedProducts = mutableMapOf<String?, List<Product>>()
    private var cachedCategories: List<Category>? = null

    suspend fun getProducts(
        forceRefresh: Boolean = false,
        categorySlug: String? = null
    ): Result<List<Product>> = runCatching {
        mutex.withLock {
            if (!forceRefresh) {
                cachedProducts[categorySlug]?.let { return@runCatching it }
            }

            api.getProducts(categorySlug = categorySlug)
                .also { cachedProducts[categorySlug] = it }
        }
    }

    suspend fun getProduct(id: Int): Result<Product> = runCatching {
        cachedProducts.values.asSequence().flatten().firstOrNull { it.id == id }
            ?.let { return@runCatching it }
        api.getProduct(id)
    }

    suspend fun getCategories(forceRefresh: Boolean = false): Result<List<Category>> = runCatching {
        mutex.withLock {
            if (!forceRefresh) {
                cachedCategories?.let { return@runCatching it }
            }

            api.getCategories().also { cachedCategories = it }
        }
    }

    suspend fun askProductQuestion(productId: Int, question: String) = runCatching {
        api.askProductQuestion(AskQuestionRequest(productId = productId, question = question))
    }

    suspend fun getProductQuestions(productId: Int) = runCatching {
        api.getProductQuestions(productId)
    }
}
