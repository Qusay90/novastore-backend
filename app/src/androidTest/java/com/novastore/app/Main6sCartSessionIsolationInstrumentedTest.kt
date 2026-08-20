package com.novastore.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.novastore.app.core.database.AppDatabase
import com.novastore.app.core.database.CartDao
import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.core.session.SessionManager
import com.novastore.app.data.model.CartItem
import com.novastore.app.data.model.SharedCartPayload
import com.novastore.app.data.model.SharedCartStateRequest
import com.novastore.app.data.model.SharedCartStateResponse
import com.novastore.app.data.repository.CartRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.lang.reflect.Proxy

@RunWith(AndroidJUnit4::class)
class Main6sCartSessionIsolationInstrumentedTest {
    private lateinit var context: Context
    private lateinit var database: AppDatabase
    private lateinit var sessionManager: SessionManager

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        sessionManager = SessionManager(context).also { it.clearSession() }
        context.getSharedPreferences("novastore_cart_sync_prefs", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
    }

    @After
    fun tearDown() {
        sessionManager.clearSession()
        context.getSharedPreferences("novastore_cart_sync_prefs", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        database.close()
    }

    @Test
    fun staleCustomerCartMutationNeverUploadsWithTheNextCustomersSession() = runBlocking {
        sessionManager.saveSession(
            token = "fixture-token-a",
            userId = 7001,
            fullName = "Müşteri A",
            email = "a@local.invalid"
        )
        val ownerA = requireNotNull(sessionManager.captureSession())
        var uploadedGeneration: Long? = null

        val api = Proxy.newProxyInstance(
            NovaStoreApi::class.java.classLoader,
            arrayOf(NovaStoreApi::class.java)
        ) { _, method, args ->
            when (method.name) {
                "putSharedCart" -> {
                    uploadedGeneration = args?.get(0) as Long?
                    val request = args?.get(1) as SharedCartStateRequest
                    sessionManager.saveSession(
                        token = "fixture-token-b",
                        userId = 7002,
                        fullName = "Müşteri B",
                        email = "b@local.invalid"
                    )
                    SharedCartStateResponse(
                        key = "cart",
                        exists = true,
                        payload = request.payload
                    )
                }
                "toString" -> "Main6sCartSessionIsolationApi"
                else -> error("Unexpected API method: ${method.name}")
            }
        } as NovaStoreApi

        val repository = CartRepository(
            context = context,
            cartDao = database.cartDao(),
            api = api,
            sessionManager = sessionManager
        )
        val result = repository.addToCart(
            CartItem(201, "Müşteri A ürünü", 1299.0, null, 1),
            ownerA
        )

        assertTrue(result.isFailure)
        assertEquals(ownerA.generation, uploadedGeneration)
        assertEquals(7002, sessionManager.userId)
        assertTrue(database.cartDao().getAllItems().first().isEmpty())
    }

    @Test
    fun authenticatedCartIsClearedBeforeASecondCustomerWithNoRemoteCartLogsIn() = runBlocking {
        var putCount = 0
        val api = cartApi(
            onGet = {
                SharedCartStateResponse("cart", exists = false, payload = SharedCartPayload())
            },
            onPut = { _, request ->
                putCount += 1
                SharedCartStateResponse("cart", exists = true, payload = request.payload)
            }
        )
        val repository = repository(api)

        saveSession(7001, "a")
        val ownerA = requireNotNull(sessionManager.captureSession())
        assertTrue(repository.addToCart(item(201, "A ürünü"), ownerA).isSuccess)
        assertEquals(1, putCount)

        sessionManager.clearSession()
        assertTrue(repository.clearAuthenticatedCartOnLogout().isSuccess)
        saveSession(7002, "b")
        putCount = 0
        assertTrue(repository.refreshCartFromServer().isSuccess)

        assertEquals(0, putCount)
        assertTrue(database.cartDao().getAllItems().first().isEmpty())
    }

    @Test
    fun onlyAnExplicitGuestCartMigratesOnceToTheFirstAuthenticatedCustomer() = runBlocking {
        var uploadedGeneration: Long? = null
        var uploadedItems: List<CartItem> = emptyList()
        val api = cartApi(
            onGet = {
                SharedCartStateResponse("cart", exists = false, payload = SharedCartPayload())
            },
            onPut = { generation, request ->
                uploadedGeneration = generation
                uploadedItems = request.payload.items
                SharedCartStateResponse("cart", exists = true, payload = request.payload)
            }
        )
        val repository = repository(api)

        assertTrue(repository.addToCart(item(204, "Guest ürünü")).isSuccess)
        saveSession(7002, "b")
        val ownerB = requireNotNull(sessionManager.captureSession())
        assertTrue(repository.refreshCartFromServer().isSuccess)

        assertEquals(ownerB.generation, uploadedGeneration)
        assertEquals(listOf(204), uploadedItems.map(CartItem::productId))
        uploadedItems = emptyList()
        assertTrue(repository.refreshCartFromServer().isSuccess)
        assertTrue(uploadedItems.isEmpty())
    }

    @Test
    fun staleRemoteCartResponseIsNotAppliedAfterTheCustomerChanges() = runBlocking {
        saveSession(7001, "a")
        val api = cartApi(
            onGet = {
                saveSession(7002, "b")
                SharedCartStateResponse(
                    "cart",
                    exists = true,
                    payload = SharedCartPayload(items = listOf(item(201, "A uzak ürünü")))
                )
            },
            onPut = { _, request ->
                SharedCartStateResponse("cart", exists = true, payload = request.payload)
            }
        )

        val result = repository(api).refreshCartFromServer()

        assertTrue(result.isFailure)
        assertEquals(7002, sessionManager.userId)
        assertTrue(database.cartDao().getAllItems().first().isEmpty())
    }

    @Test
    fun sessionChangeDuringRemoteCartDaoWriteClearsTheStaleRows() = runBlocking {
        saveSession(7001, "a")
        val api = cartApi(
            onGet = {
                SharedCartStateResponse(
                    "cart",
                    exists = true,
                    payload = SharedCartPayload(items = listOf(item(201, "A remote product")))
                )
            },
            onPut = { _, request ->
                SharedCartStateResponse("cart", exists = true, payload = request.payload)
            }
        )
        val delegate = database.cartDao()
        val switchingDao = object : CartDao by delegate {
            override suspend fun replaceAll(items: List<CartItem>) {
                delegate.replaceAll(items)
                saveSession(7002, "b")
            }
        }
        val repository = CartRepository(
            context = context,
            cartDao = switchingDao,
            api = api,
            sessionManager = sessionManager
        )

        val result = repository.refreshCartFromServer()

        assertTrue(result.isFailure)
        assertEquals(7002, sessionManager.userId)
        assertTrue(database.cartDao().getAllItems().first().isEmpty())
        assertTrue(
            !context.getSharedPreferences("novastore_cart_sync_prefs", Context.MODE_PRIVATE)
                .contains("cart_migration_complete_7001")
        )
    }

    private fun repository(api: NovaStoreApi) = CartRepository(
        context = context,
        cartDao = database.cartDao(),
        api = api,
        sessionManager = sessionManager
    )

    private fun saveSession(userId: Int, suffix: String) {
        sessionManager.saveSession(
            token = "fixture-token-$suffix",
            userId = userId,
            fullName = "Müşteri $suffix",
            email = "$suffix@local.invalid"
        )
    }

    private fun item(id: Int, name: String) = CartItem(id, name, 1299.0, null, 1)

    private fun cartApi(
        onGet: (Long?) -> SharedCartStateResponse,
        onPut: (Long?, SharedCartStateRequest) -> SharedCartStateResponse
    ): NovaStoreApi = Proxy.newProxyInstance(
        NovaStoreApi::class.java.classLoader,
        arrayOf(NovaStoreApi::class.java)
    ) { _, method, args ->
        when (method.name) {
            "getSharedCart" -> onGet(args?.get(0) as Long?)
            "putSharedCart" -> onPut(args?.get(0) as Long?, args?.get(1) as SharedCartStateRequest)
            "toString" -> "Main6sCartProvenanceApi"
            else -> error("Unexpected API method: ${method.name}")
        }
    } as NovaStoreApi
}
