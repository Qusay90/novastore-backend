package com.novastore.app.data.repository

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.novastore.app.core.network.NovaStoreApi
import com.novastore.app.core.session.SessionManager
import com.novastore.app.data.model.CustomerAddress
import com.novastore.app.data.model.FavoriteSyncRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

internal fun customerScopedPreferenceKey(base: String, userId: Int?): String =
    userId?.let { "${base}_$it" } ?: base

internal fun isCurrentCustomerOwner(
    expectedUserId: Int?,
    expectedGeneration: Long,
    currentUserId: Int?,
    currentGeneration: Long
): Boolean = expectedUserId == currentUserId && expectedGeneration == currentGeneration

internal fun shouldPersistCustomerAddressState(userId: Int?): Boolean = userId != null

@Singleton
class CustomerLocalRepository @Inject constructor(
    @ApplicationContext context: Context,
    private val api: NovaStoreApi,
    private val sessionManager: SessionManager
) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    private var favoriteOwnerId: Int? = activeUserId()
    private val _favoriteIds = MutableStateFlow(readFavoriteIdsForUser(favoriteOwnerId))
    val favoriteIds: StateFlow<Set<Int>> = _favoriteIds.asStateFlow()

    private val startupAddressOwnerId = activeUserId()
    private val startupAddressState = initializeAddressScope(startupAddressOwnerId)
    private var addressOwnerId: Int? = startupAddressOwnerId
    private val _addresses = MutableStateFlow(startupAddressState.addresses)
    val addresses: StateFlow<List<CustomerAddress>> = _addresses.asStateFlow()

    private val _selectedAddressId = MutableStateFlow(startupAddressState.selectedAddressId)
    val selectedAddressId: StateFlow<Long> = _selectedAddressId.asStateFlow()

    fun refreshSessionScopedState() {
        switchAddressOwnerIfNeeded()
        switchFavoriteOwnerIfNeeded()
    }

    val selectedAddress: CustomerAddress?
        get() {
            switchAddressOwnerIfNeeded()
            return _addresses.value.firstOrNull { it.id == _selectedAddressId.value }
            ?: _addresses.value.firstOrNull()
        }

    fun toggleFavorite(productId: Int) {
        setFavoriteLocal(productId, !_favoriteIds.value.contains(productId))
    }

    fun setFavorite(productId: Int, isFavorite: Boolean) {
        setFavoriteLocal(productId, isFavorite)
    }

    suspend fun refreshFavorites(allowMigration: Boolean = true): Result<Set<Int>> = runCatching {
        val owner = captureCustomerOwner()
        val userId = owner.userId
        if (userId == null) {
            val guestFavorites = readFavoriteIdsForUser(null)
            _favoriteIds.value = guestFavorites
            return@runCatching guestFavorites
        }

        val localUserFavorites = readFavoriteIdsForUser(userId)
        val legacyFavorites = readFavoriteIdsForUser(null)
        val migrationFavorites = (localUserFavorites + legacyFavorites).toSet()

        if (allowMigration && !isFavoriteMigrationComplete(userId) && migrationFavorites.isNotEmpty()) {
            api.syncFavorites(
                sessionGeneration = owner.generation,
                body = FavoriteSyncRequest(migrationFavorites.sorted())
            )
            ensureCustomerOwnerCurrent(owner)
            markFavoriteMigrationComplete(userId)
            prefs.edit().remove(KEY_FAVORITES).apply()
        } else if (allowMigration && !isFavoriteMigrationComplete(userId)) {
            ensureCustomerOwnerCurrent(owner)
            markFavoriteMigrationComplete(userId)
        }

        val remoteFavorites = api.getFavorites(owner.generation).normalizedProductIds
        ensureCustomerOwnerCurrent(owner)
        saveFavoriteIds(remoteFavorites, userId)
        remoteFavorites
    }.onFailure {
        refreshSessionScopedState()
    }

    suspend fun toggleFavoriteSynced(productId: Int): Result<Boolean> {
        val shouldFavorite = !_favoriteIds.value.contains(productId)
        return setFavoriteSynced(productId, shouldFavorite).map { shouldFavorite }
    }

    suspend fun setFavoriteSynced(productId: Int, isFavorite: Boolean): Result<Unit> = runCatching {
        val owner = captureCustomerOwner()
        val userId = owner.userId
        if (userId == null) {
            setFavoriteLocal(productId, isFavorite)
            return@runCatching
        }

        val previous = _favoriteIds.value
        setFavoriteLocal(productId, isFavorite, userId)
        try {
            if (isFavorite) {
                api.addFavorite(productId, owner.generation)
            } else {
                api.removeFavorite(productId, owner.generation)
            }
            ensureCustomerOwnerCurrent(owner)
            refreshFavorites(allowMigration = false).getOrThrow()
            ensureCustomerOwnerCurrent(owner)
        } catch (error: Throwable) {
            if (isCustomerOwnerCurrent(owner)) saveFavoriteIds(previous, userId)
            throw error
        }
    }.onFailure {
        refreshSessionScopedState()
    }

    private fun setFavoriteLocal(productId: Int, isFavorite: Boolean, userId: Int? = activeUserId()) {
        switchFavoriteOwnerIfNeeded()
        check(userId == favoriteOwnerId) { "Customer session changed before favorite update." }
        val updated = _favoriteIds.value.toMutableSet().apply {
            if (isFavorite) add(productId) else remove(productId)
        }
        saveFavoriteIds(updated, userId)
    }

    fun saveAddress(address: CustomerAddress) {
        val owner = captureCustomerOwner()
        val normalized = if (address.id == 0L) address.copy(id = System.currentTimeMillis()) else address
        val updated = _addresses.value
            .filterNot { it.id == normalized.id }
            .plus(normalized)
            .ensureSingleDefault(normalized.id.takeIf { normalized.isDefault })
        saveAddresses(updated, owner.userId)

        if (_selectedAddressId.value == NO_ADDRESS_ID) {
            selectAddressForOwner(normalized.id, owner.userId)
        }
    }

    fun deleteAddress(id: Long) {
        val owner = captureCustomerOwner()
        val updated = _addresses.value.filterNot { it.id == id }
        saveAddresses(updated, owner.userId)

        if (_selectedAddressId.value == id) {
            selectAddressForOwner(updated.firstOrNull()?.id ?: NO_ADDRESS_ID, owner.userId)
        }
    }

    fun selectAddress(id: Long) {
        val owner = captureCustomerOwner()
        selectAddressForOwner(id, owner.userId)
    }

    suspend fun refreshAddresses(allowMigration: Boolean = true): Result<List<CustomerAddress>> = runCatching {
        val owner = captureCustomerOwner()
        val localBeforeRefresh = _addresses.value
        var remote = api.getAddresses().normalizedDefaultOrder()
        ensureCustomerOwnerCurrent(owner)
        val canMigrateLocal = allowMigration && !isAddressMigrationComplete(owner.userId)
        if (remote.isEmpty() && localBeforeRefresh.isNotEmpty() && canMigrateLocal) {
            localBeforeRefresh.forEach { local ->
                runCatching {
                    api.createAddress(
                        sessionGeneration = owner.generation,
                        body = local.copy(id = 0L, isDefault = local.id == _selectedAddressId.value)
                    )
                }
            }
            ensureCustomerOwnerCurrent(owner)
            markAddressMigrationComplete(owner.userId)
            remote = api.getAddresses().normalizedDefaultOrder()
            ensureCustomerOwnerCurrent(owner)
        }
        saveAddresses(remote, owner.userId)
        val defaultId = remote.firstOrNull { it.isDefault }?.id ?: remote.firstOrNull()?.id ?: NO_ADDRESS_ID
        selectAddressForOwner(defaultId, owner.userId)
        markAddressMigrationComplete(owner.userId)
        remote
    }.onFailure {
        switchAddressOwnerIfNeeded()
    }

    suspend fun saveAddressSynced(address: CustomerAddress): Result<CustomerAddress> {
        val owner = captureCustomerOwner()
        return runCatching {
        val saved = if (address.id == 0L) {
            api.createAddress(
                sessionGeneration = owner.generation,
                body = address.copy(isDefault = _addresses.value.isEmpty())
            )
        } else {
            api.updateAddress(address.id, sessionGeneration = owner.generation, body = address)
        }
        ensureCustomerOwnerCurrent(owner)
        refreshAddresses().getOrNull()
        ensureCustomerOwnerCurrent(owner)
        markAddressMigrationComplete(owner.userId)
        if (_selectedAddressId.value == NO_ADDRESS_ID || saved.isDefault) {
            selectAddressForOwner(saved.id, owner.userId)
        }
        saved
    }.onFailure {
            if (isCustomerOwnerCurrent(owner)) saveAddressForOwner(address, owner.userId)
        }
    }

    suspend fun deleteAddressSynced(id: Long): Result<Unit> {
        val owner = captureCustomerOwner()
        return runCatching {
        api.deleteAddress(id, sessionGeneration = owner.generation)
        ensureCustomerOwnerCurrent(owner)
        deleteAddressForOwner(id, owner.userId)
        markAddressMigrationComplete(owner.userId)
        refreshAddresses(allowMigration = false).getOrNull()
        Unit
    }.onFailure {
            if (isCustomerOwnerCurrent(owner)) deleteAddressForOwner(id, owner.userId)
        }
    }

    suspend fun selectAddressSynced(id: Long): Result<CustomerAddress?> {
        val owner = captureCustomerOwner()
        return runCatching {
        val selected = api.setDefaultAddress(id, sessionGeneration = owner.generation)
        ensureCustomerOwnerCurrent(owner)
        refreshAddresses().getOrNull()
        ensureCustomerOwnerCurrent(owner)
        selectAddressForOwner(selected.id, owner.userId)
        selected
    }.onFailure {
            if (isCustomerOwnerCurrent(owner)) selectAddressForOwner(id, owner.userId)
        }
    }

    private fun saveAddressForOwner(address: CustomerAddress, userId: Int?) {
        val normalized = if (address.id == 0L) address.copy(id = System.currentTimeMillis()) else address
        val updated = (if (userId == null) _addresses.value else readAddressesForUser(userId))
            .filterNot { it.id == normalized.id }
            .plus(normalized)
            .ensureSingleDefault(normalized.id.takeIf { normalized.isDefault })
        saveAddresses(updated, userId)
    }

    private fun deleteAddressForOwner(id: Long, userId: Int?) {
        val updated = (if (userId == null) _addresses.value else readAddressesForUser(userId))
            .filterNot { it.id == id }
        saveAddresses(updated, userId)
        val selectedId = if (userId == null) _selectedAddressId.value else readSelectedAddressId(userId)
        if (selectedId == id) {
            selectAddressForOwner(updated.firstOrNull()?.id ?: NO_ADDRESS_ID, userId)
        }
    }

    private fun saveAddresses(addresses: List<CustomerAddress>, userId: Int?) {
        if (shouldPersistCustomerAddressState(userId)) {
            prefs.edit().putString(addressKey(userId), gson.toJson(addresses)).apply()
        }
        _addresses.value = addresses
    }

    private fun selectAddressForOwner(id: Long, userId: Int?) {
        if (shouldPersistCustomerAddressState(userId)) {
            prefs.edit().putLong(selectedAddressKey(userId), id).apply()
        }
        _selectedAddressId.value = id
    }

    private fun isAddressMigrationComplete(userId: Int?): Boolean =
        prefs.getBoolean(addressMigrationKey(userId), false)

    private fun markAddressMigrationComplete(userId: Int?) {
        prefs.edit().putBoolean(addressMigrationKey(userId), true).apply()
    }

    private fun readFavoriteIdsForUser(userId: Int?): Set<Int> {
        return prefs.getStringSet(favoriteKey(userId), emptySet()).orEmpty()
            .mapNotNull { it.toIntOrNull() }
            .toSet()
    }

    private fun saveFavoriteIds(favorites: Set<Int>, userId: Int? = activeUserId()) {
        prefs.edit().putStringSet(favoriteKey(userId), favorites.map { it.toString() }.toSet()).apply()
        _favoriteIds.value = favorites
    }

    private fun activeUserId(): Int? =
        sessionManager.userId.takeIf { sessionManager.isLoggedIn && it > 0 }

    private fun favoriteKey(userId: Int?): String =
        if (userId != null) "${KEY_FAVORITES}_$userId" else KEY_FAVORITES

    private fun favoriteMigrationKey(userId: Int): String =
        "${KEY_FAVORITES_MIGRATION_COMPLETE}_$userId"

    private fun isFavoriteMigrationComplete(userId: Int): Boolean =
        prefs.getBoolean(favoriteMigrationKey(userId), false)

    private fun markFavoriteMigrationComplete(userId: Int) {
        prefs.edit().putBoolean(favoriteMigrationKey(userId), true).apply()
    }

    private fun readAddressesForUser(userId: Int?): List<CustomerAddress> {
        if (userId == null) return emptyList()
        val raw = prefs.getString(addressKey(userId), null) ?: return emptyList()
        return runCatching {
            val type = object : TypeToken<List<CustomerAddress>>() {}.type
            gson.fromJson<List<CustomerAddress>>(raw, type).orEmpty()
        }.getOrDefault(emptyList())
    }

    private data class CustomerOwner(val userId: Int?, val generation: Long)

    private data class StartupAddressState(
        val addresses: List<CustomerAddress>,
        val selectedAddressId: Long
    )

    /** Legacy address data has no provable owner and is removed rather than reassigned. */
    private fun initializeAddressScope(userId: Int?): StartupAddressState {
        if (
            prefs.contains(KEY_ADDRESSES) ||
            prefs.contains(KEY_SELECTED_ADDRESS_ID) ||
            prefs.contains(KEY_ADDRESS_MIGRATION_COMPLETE)
        ) {
            prefs.edit()
                .remove(KEY_ADDRESSES)
                .remove(KEY_SELECTED_ADDRESS_ID)
                .remove(KEY_ADDRESS_MIGRATION_COMPLETE)
                .apply()
        }
        return StartupAddressState(
            addresses = readAddressesForUser(userId),
            selectedAddressId = readSelectedAddressId(userId)
        )
    }

    private fun captureCustomerOwner(): CustomerOwner {
        switchAddressOwnerIfNeeded()
        switchFavoriteOwnerIfNeeded()
        return CustomerOwner(activeUserId(), sessionManager.generation)
    }

    private fun isCustomerOwnerCurrent(owner: CustomerOwner): Boolean =
        isCurrentCustomerOwner(
            expectedUserId = owner.userId,
            expectedGeneration = owner.generation,
            currentUserId = activeUserId(),
            currentGeneration = sessionManager.generation
        )

    private fun ensureCustomerOwnerCurrent(owner: CustomerOwner) {
        check(isCustomerOwnerCurrent(owner)) { "Customer session changed during customer operation." }
    }

    private fun switchAddressOwnerIfNeeded() {
        val currentOwnerId = activeUserId()
        if (currentOwnerId == addressOwnerId) return
        addressOwnerId = currentOwnerId
        _addresses.value = readAddressesForUser(currentOwnerId)
        _selectedAddressId.value = readSelectedAddressId(currentOwnerId)
    }

    private fun switchFavoriteOwnerIfNeeded() {
        val currentOwnerId = activeUserId()
        if (currentOwnerId == favoriteOwnerId) return
        favoriteOwnerId = currentOwnerId
        _favoriteIds.value = readFavoriteIdsForUser(currentOwnerId)
    }

    private fun addressKey(userId: Int?): String =
        customerScopedPreferenceKey(KEY_ADDRESSES, userId)

    private fun selectedAddressKey(userId: Int?): String =
        customerScopedPreferenceKey(KEY_SELECTED_ADDRESS_ID, userId)

    private fun addressMigrationKey(userId: Int?): String =
        customerScopedPreferenceKey(KEY_ADDRESS_MIGRATION_COMPLETE, userId)

    private fun readSelectedAddressId(userId: Int?): Long =
        userId?.let { prefs.getLong(selectedAddressKey(it), NO_ADDRESS_ID) } ?: NO_ADDRESS_ID

    companion object {
        private const val PREFS_NAME = "novastore_customer_local_prefs"
        private const val KEY_FAVORITES = "favorite_product_ids"
        private const val KEY_FAVORITES_MIGRATION_COMPLETE = "favorite_product_ids_migrated"
        private const val KEY_ADDRESSES = "addresses"
        private const val KEY_SELECTED_ADDRESS_ID = "selected_address_id"
        private const val KEY_ADDRESS_MIGRATION_COMPLETE = "addresses_migration_complete"
        private const val NO_ADDRESS_ID = -1L
    }
}

private fun List<CustomerAddress>.ensureSingleDefault(defaultId: Long?): List<CustomerAddress> {
    if (isEmpty()) return this
    val targetId = defaultId ?: firstOrNull { it.isDefault }?.id ?: first().id
    return map { it.copy(isDefault = it.id == targetId) }
}

private fun List<CustomerAddress>.normalizedDefaultOrder(): List<CustomerAddress> {
    return ensureSingleDefault(firstOrNull { it.isDefault }?.id)
        .sortedWith(compareByDescending<CustomerAddress> { it.isDefault }.thenBy { it.id })
}
