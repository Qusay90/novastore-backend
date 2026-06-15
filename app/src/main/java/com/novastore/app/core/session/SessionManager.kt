package com.novastore.app.core.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val legacyPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val securePrefs = createSecurePrefs()

    init {
        migrateLegacySession()
    }

    fun saveSession(token: String, userId: Int, fullName: String, email: String, phone: String? = null) {
        val prefs = requireSecurePrefs()
        prefs.edit().apply {
            putString(KEY_TOKEN, token)
            putInt(KEY_USER_ID, userId)
            putString(KEY_FULL_NAME, fullName)
            putString(KEY_EMAIL, email)
            putString(KEY_PHONE, phone)
            apply()
        }
        clearLegacySessionKeys()
    }

    fun updateProfile(fullName: String, phone: String?) {
        val prefs = securePrefs ?: return
        prefs.edit().apply {
            putString(KEY_FULL_NAME, fullName)
            putString(KEY_PHONE, phone)
            apply()
        }
    }

    fun clearSession() {
        securePrefs?.edit()?.clear()?.apply()
        clearLegacySessionKeys()
    }

    val token: String?
        get() = securePrefs?.getString(KEY_TOKEN, null)

    val userId: Int
        get() = securePrefs?.getInt(KEY_USER_ID, -1) ?: -1

    val fullName: String?
        get() = securePrefs?.getString(KEY_FULL_NAME, null)

    val email: String?
        get() = securePrefs?.getString(KEY_EMAIL, null)

    val phone: String?
        get() = securePrefs?.getString(KEY_PHONE, null)

    val isLoggedIn: Boolean
        get() = token != null

    private fun createSecurePrefs(): SharedPreferences? = runCatching {
        val masterKey = MasterKey.Builder(context, MasterKey.DEFAULT_MASTER_KEY_ALIAS)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            SECURE_PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }.getOrNull()

    private fun requireSecurePrefs(): SharedPreferences =
        securePrefs ?: throw IllegalStateException("Secure session storage unavailable.")

    private fun migrateLegacySession() {
        val legacyToken = legacyPrefs.getString(KEY_TOKEN, null)
        if (legacyToken.isNullOrBlank()) return

        val target = securePrefs
        if (target == null) {
            clearLegacySessionKeys()
            return
        }

        target.edit().apply {
            putString(KEY_TOKEN, legacyToken)
            putInt(KEY_USER_ID, legacyPrefs.getInt(KEY_USER_ID, -1))
            putString(KEY_FULL_NAME, legacyPrefs.getString(KEY_FULL_NAME, null))
            putString(KEY_EMAIL, legacyPrefs.getString(KEY_EMAIL, null))
            putString(KEY_PHONE, legacyPrefs.getString(KEY_PHONE, null))
            apply()
        }
        clearLegacySessionKeys()
    }

    private fun clearLegacySessionKeys() {
        legacyPrefs.edit().apply {
            remove(KEY_TOKEN)
            remove(KEY_USER_ID)
            remove(KEY_FULL_NAME)
            remove(KEY_EMAIL)
            remove(KEY_PHONE)
            apply()
        }
    }

    companion object {
        private const val PREFS_NAME = "novastore_session_prefs"
        private const val SECURE_PREFS_NAME = "novastore_secure_session_prefs"
        private const val KEY_TOKEN = "session_token"
        private const val KEY_USER_ID = "session_user_id"
        private const val KEY_FULL_NAME = "session_full_name"
        private const val KEY_EMAIL = "session_email"
        private const val KEY_PHONE = "session_phone"
    }
}
