package com.novastore.seller.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.sync.Mutex

class SellerSessionStore(context: Context) {
    private val preferences = EncryptedSharedPreferences.create(
        context,
        "novastore_seller_session",
        MasterKey.Builder(context, MasterKey.DEFAULT_MASTER_KEY_ALIAS)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    val refreshMutex = Mutex()
    val accessToken: String? get() = preferences.getString(KEY_ACCESS, null)
    val refreshToken: String? get() = preferences.getString(KEY_REFRESH, null)
    val sessionId: String? get() = preferences.getString(KEY_SESSION, null)
    val organizationId: Long get() = preferences.getLong(KEY_ORGANIZATION, -1L)

    fun save(tokens: SellerTokenResponse) {
        require(tokens.tokenType.equals("Bearer", ignoreCase = true))
        preferences.edit()
            .putString(KEY_ACCESS, tokens.accessToken)
            .putString(KEY_REFRESH, tokens.refreshToken)
            .putString(KEY_SESSION, tokens.sessionId)
            .putLong(KEY_ORGANIZATION, tokens.organization?.id ?: -1L)
            .apply()
    }

    fun clear() = preferences.edit().clear().apply()

    companion object {
        private const val KEY_ACCESS = "seller_access_token"
        private const val KEY_REFRESH = "seller_refresh_token"
        private const val KEY_SESSION = "seller_session_id"
        private const val KEY_ORGANIZATION = "seller_organization_id"
    }
}
