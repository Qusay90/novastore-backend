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

@Singleton
class CustomerLocalRepository @Inject constructor(
    @ApplicationContext context: Context,
    private val api: NovaStoreApi,
    private val sessionManager: SessionManager
) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    private val _favoriteIds = MutableStateFlow(readFavoriteIds())
    val favoriteIds: StateFlow<Set<Int>> = _favoriteIds.asStateFlow()

    private val _addresses = MutableStateFlow(readAddresses())
    val addresses: StateFlow<List<CustomerAddress>> = _addresses.asStateFlow()

    private val _selectedAddressId = MutableStateFlow(prefs.getLong(KEY_SELECTED_ADDRESS_ID, NO_ADDRESS_ID))
    val selectedAddressId: StateFlow<Long> = _selectedAddressId.asStateFlow()

    val selectedAddress: CustomerAddress?
        get() = _addresses.value.firstOrNull { it.id == _selectedAddressId.value }
            ?: _addresses.value.firstOrNull()

    fun toggleFavorite(productId: Int) {
        setFavoriteLocal(productId, !_favoriteIds.value.contains(productId))
    }

    fun setFavorite(productId: Int, isFavorite: Boolean) {
        setFavoriteLocal(productId, isFavorite)
    }

    suspend fun refreshFavorites(allowMigration: Boolean = true): Result<Set<Int>> = runCatching {
        val userId = activeUserId()
        if (userId == null) {
            val guestFavorites = readFavoriteIdsForUser(null)
            _favoriteIds.value = guestFavorites
            return@runCatching guestFavorites
        }

        val localUserFavorites = readFavoriteIdsForUser(userId)
        val legacyFavorites = readFavoriteIdsForUser(null)
        val migrationFavorites = (localUserFavorites + legacyFavorites).toSet()

        if (allowMigration && !isFavoriteMigrationComplete(userId) && migrationFavorites.isNotEmpty()) {
            api.syncFavorites(FavoriteSyncRequest(migrationFavorites.sorted()))
            markFavoriteMigrationComplete(userId)
            prefs.edit().remove(KEY_FAVORITES).apply()
        } else if (allowMigration && !isFavoriteMigrationComplete(userId)) {
            markFavoriteMigrationComplete(userId)
        }

        val remoteFavorites = api.getFavorites().normalizedProductIds
        saveFavoriteIds(remoteFavorites, userId)
        remoteFavorites
    }.onFailure {
        _favoriteIds.value = readFavoriteIdsForUser(activeUserId())
    }

    suspend fun toggleFavoriteSynced(productId: Int): Result<Boolean> {
        val shouldFavorite = !_favoriteIds.value.contains(productId)
        return setFavoriteSynced(productId, shouldFavorite).map { shouldFavorite }
    }

    suspend fun setFavoriteSynced(productId: Int, isFavorite: Boolean): Result<Unit> = runCatching {
        val userId = activeUserId()
        if (userId == null) {
            setFavoriteLocal(productId, isFavorite)
            return@runCatching
        }

        val previous = _favoriteIds.value
        setFavoriteLocal(productId, isFavorite, userId)
        try {
            if (isFavorite) {
                api.addFavorite(productId)
            } else {
                api.removeFavorite(productId)
            }
            refreshFavorites(allowMigration = false).getOrThrow()
        } catch (error: Throwable) {
            saveFavoriteIds(previous, userId)
            throw error
        }
    }.onFailure {
        _favoriteIds.value = readFavoriteIdsForUser(activeUserId())
    }

    private fun setFavoriteLocal(productId: Int, isFavorite: Boolean, userId: Int? = activeUserId()) {
        val updated = _favoriteIds.value.toMutableSet().apply {
            if (isFavorite) add(productId) else remove(productId)
        }
        saveFavoriteIds(updated, userId)
    }

    fun saveAddress(address: CustomerAddress) {
        val normalized = if (address.id == 0L) address.copy(id = System.currentTimeMillis()) else address
        val updated = _addresses.value
            .filterNot { it.id == normalized.id }
            .plus(normalized)
            .ensureSingleDefault(normalized.id.takeIf { normalized.isDefault })
        saveAddresses(updated)

        if (_selectedAddressId.value == NO_ADDRESS_ID) {
            selectAddress(normalized.id)
        }
    }

    fun deleteAddress(id: Long) {
        val updated = _addresses.value.filterNot { it.id == id }
        saveAddresses(updated)

        if (_selectedAddressId.value == id) {
            selectAddress(updated.firstOrNull()?.id ?: NO_ADDRESS_ID)
        }
    }

    fun selectAddress(id: Long) {
        prefs.edit().putLong(KEY_SELECTED_ADDRESS_ID, id).apply()
        _selectedAddressId.value = id
    }

    suspend fun refreshAddresses(allowMigration: Boolean = true): Result<List<CustomerAddress>> = runCatching {
        val localBeforeRefresh = _addresses.value
        var remote = api.getAddresses().normalizedDefaultOrder()
        val canMigrateLocal = allowMigration && !isAddressMigrationComplete()
        if (remote.isEmpty() && localBeforeRefresh.isNotEmpty() && canMigrateLocal) {
            localBeforeRefresh.forEach { local ->
                runCatching {
                    api.createAddress(local.copy(id = 0L, isDefault = local.id == _selectedAddressId.value))
                }
            }
            markAddressMigrationComplete()
            remote = api.getAddresses().normalizedDefaultOrder()
        }
        saveAddresses(remote)
        val defaultId = remote.firstOrNull { it.isDefault }?.id ?: remote.firstOrNull()?.id ?: NO_ADDRESS_ID
        selectAddress(defaultId)
        markAddressMigrationComplete()
        remote
    }

    suspend fun saveAddressSynced(address: CustomerAddress): Result<CustomerAddress> = runCatching {
        val saved = if (address.id == 0L) {
            api.createAddress(address.copy(isDefault = _addresses.value.isEmpty()))
        } else {
            api.updateAddress(address.id, address)
        }
        refreshAddresses().getOrNull()
        markAddressMigrationComplete()
        if (_selectedAddressId.value == NO_ADDRESS_ID || saved.isDefault) {
            selectAddress(saved.id)
        }
        saved
    }.onFailure {
        saveAddress(address)
    }

    suspend fun deleteAddressSynced(id: Long): Result<Unit> = runCatching {
        api.deleteAddress(id)
        deleteAddress(id)
        markAddressMigrationComplete()
        refreshAddresses(allowMigration = false).getOrNull()
        Unit
    }.onFailure {
        deleteAddress(id)
    }

    suspend fun selectAddressSynced(id: Long): Result<CustomerAddress?> = runCatching {
        val selected = api.setDefaultAddress(id)
        refreshAddresses().getOrNull()
        selectAddress(selected.id)
        selected
    }.onFailure {
        selectAddress(id)
    }

    private fun saveAddresses(addresses: List<CustomerAddress>) {
        prefs.edit().putString(KEY_ADDRESSES, gson.toJson(addresses)).apply()
        _addresses.value = addresses
    }

    private fun isAddressMigrationComplete(): Boolean =
        prefs.getBoolean(KEY_ADDRESS_MIGRATION_COMPLETE, false)

    private fun markAddressMigrationComplete() {
        prefs.edit().putBoolean(KEY_ADDRESS_MIGRATION_COMPLETE, true).apply()
    }

    private fun readFavoriteIds(): Set<Int> {
        return readFavoriteIdsForUser(activeUserId())
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

    private fun readAddresses(): List<CustomerAddress> {
        val raw = prefs.getString(KEY_ADDRESSES, null) ?: return emptyList()
        return runCatching {
            val type = object : TypeToken<List<CustomerAddress>>() {}.type
            gson.fromJson<List<CustomerAddress>>(raw, type).orEmpty()
        }.getOrDefault(emptyList())
    }

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
