package com.novastore.app.core.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionManager @Inject constructor(
    @ApplicationContext private val context: Context
) : SessionPersistence {
    private val sessionLock = Any()
    private val legacyPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val securePrefs = createSecurePrefs()
    private val _isLoggedInFlow = MutableStateFlow(false)
    val isLoggedInFlow: StateFlow<Boolean> = _isLoggedInFlow.asStateFlow()

    @Volatile
    private var sessionGeneration: Long = 0L

    init {
        migrateLegacySession()
    }

    fun saveSession(
        token: String,
        userId: Int,
        fullName: String,
        email: String,
        phone: String? = null,
        role: String? = "customer",
        emailVerified: Boolean = false,
        phoneVerified: Boolean = false
    ) {
        synchronized(sessionLock) {
            val prefs = requireSecurePrefs()
            prefs.edit().apply {
                putString(KEY_TOKEN, token)
                putInt(KEY_USER_ID, userId)
                putString(KEY_FULL_NAME, fullName)
                putString(KEY_EMAIL, email)
                putString(KEY_PHONE, phone)
                putString(KEY_ROLE, role)
                putBoolean(KEY_EMAIL_VERIFIED, emailVerified)
                putBoolean(KEY_PHONE_VERIFIED, phoneVerified)
                apply()
            }
            clearLegacySessionKeys()
            sessionGeneration += 1
            _isLoggedInFlow.value = true
        }
    }

    override fun updateProfileIfCurrent(
        snapshot: SessionGenerationSnapshot,
        fullName: String,
        phone: String?
    ): Boolean = synchronized(sessionLock) {
        if (!matchesLocked(snapshot)) return@synchronized false
        val prefs = securePrefs ?: return@synchronized false
        prefs.edit().apply {
            putString(KEY_FULL_NAME, fullName)
            putString(KEY_PHONE, phone)
            apply()
        }
        true
    }

    fun updateUser(user: com.novastore.app.data.model.UserInfo) {
        val snapshot = captureSession() ?: return
        authenticateIfCurrent(snapshot, user)
    }

    fun clearSession() {
        synchronized(sessionLock) {
            clearLocked()
        }
    }

    override fun clear() = clearSession()

    val token: String?
        get() = captureSession()?.token

    val userId: Int
        get() = securePrefs?.getInt(KEY_USER_ID, -1) ?: -1

    val fullName: String?
        get() = securePrefs?.getString(KEY_FULL_NAME, null)

    val email: String?
        get() = securePrefs?.getString(KEY_EMAIL, null)

    val phone: String?
        get() = securePrefs?.getString(KEY_PHONE, null)

    val hasStoredSession: Boolean
        get() = captureSession() != null

    val isLoggedIn: Boolean
        get() = _isLoggedInFlow.value

    override val hasSession: Boolean
        get() = hasStoredSession

    override val generation: Long
        get() = sessionGeneration

    override fun captureSession(): SessionGenerationSnapshot? = synchronized(sessionLock) {
        val storedToken = securePrefs?.getString(KEY_TOKEN, null)
        storedToken?.takeIf { it.isNotBlank() }?.let {
            SessionGenerationSnapshot(
                token = it,
                generation = sessionGeneration,
                userId = securePrefs?.getInt(KEY_USER_ID, -1)?.takeIf { id -> id > 0 }
            )
        }
    }

    override fun isCurrent(snapshot: SessionGenerationSnapshot): Boolean =
        synchronized(sessionLock) {
            matchesLocked(snapshot)
        }

    fun markValidatedAuthenticated() {
        synchronized(sessionLock) {
            _isLoggedInFlow.value = securePrefs?.getString(KEY_TOKEN, null)?.isNotBlank() == true
        }
    }

    override fun authenticateIfCurrent(
        snapshot: SessionGenerationSnapshot,
        user: com.novastore.app.data.model.UserInfo
    ): Boolean = synchronized(sessionLock) {
        if (!matchesLocked(snapshot)) return@synchronized false
        val prefs = securePrefs ?: return@synchronized false
        prefs.edit().apply {
            putInt(KEY_USER_ID, user.id)
            putString(KEY_FULL_NAME, user.fullName)
            putString(KEY_EMAIL, user.email)
            putString(KEY_PHONE, user.phone)
            putString(KEY_ROLE, user.role)
            putBoolean(KEY_EMAIL_VERIFIED, user.emailVerified)
            putBoolean(KEY_PHONE_VERIFIED, user.phoneVerified)
            apply()
        }
        _isLoggedInFlow.value = true
        true
    }

    fun clearSessionIfCurrent(snapshot: SessionGenerationSnapshot): Boolean =
        clearIfCurrent(snapshot) != null

    override fun clearIfCurrent(snapshot: SessionGenerationSnapshot): Long? =
        synchronized(sessionLock) {
            if (!matchesLocked(snapshot)) return@synchronized null
            clearLocked()
            sessionGeneration
        }

    private fun matchesLocked(snapshot: SessionGenerationSnapshot): Boolean {
        val storedToken = securePrefs?.getString(KEY_TOKEN, null)
        return sessionGeneration == snapshot.generation && storedToken == snapshot.token
    }

    private fun clearLocked() {
        securePrefs?.edit()?.clear()?.apply()
        clearLegacySessionKeys()
        sessionGeneration += 1
        _isLoggedInFlow.value = false
    }

    override fun cachedUser(): com.novastore.app.data.model.UserInfo? {
        return synchronized(sessionLock) {
            val cachedId = userId
            val cachedName = fullName
            val cachedEmail = email
            if (cachedId < 0 || cachedName.isNullOrBlank() || cachedEmail.isNullOrBlank()) {
                return@synchronized null
            }

            com.novastore.app.data.model.UserInfo(
                id = cachedId,
                fullName = cachedName,
                email = cachedEmail,
                role = securePrefs?.getString(KEY_ROLE, "customer"),
                phone = phone,
                emailVerified = securePrefs?.getBoolean(KEY_EMAIL_VERIFIED, false) ?: false,
                phoneVerified = securePrefs?.getBoolean(KEY_PHONE_VERIFIED, false) ?: false
            )
        }
    }

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
            putString(KEY_ROLE, "customer")
            putBoolean(KEY_EMAIL_VERIFIED, false)
            putBoolean(KEY_PHONE_VERIFIED, false)
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
        private const val KEY_ROLE = "session_role"
        private const val KEY_EMAIL_VERIFIED = "session_email_verified"
        private const val KEY_PHONE_VERIFIED = "session_phone_verified"
    }
}
