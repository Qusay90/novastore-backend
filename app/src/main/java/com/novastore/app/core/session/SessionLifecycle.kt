package com.novastore.app.core.session

import com.novastore.app.data.model.UserInfo

sealed interface SessionBootstrapState {
    data object Unknown : SessionBootstrapState
    data class Authenticated(val user: UserInfo) : SessionBootstrapState
    data object Guest : SessionBootstrapState
    data class TemporaryFailure(val cachedUser: UserInfo?) : SessionBootstrapState
}

val SessionBootstrapState.isAuthenticatedForUi: Boolean
    get() = this is SessionBootstrapState.Authenticated

data class SessionGenerationSnapshot(
    val token: String,
    val generation: Long,
    val userId: Int? = null
)

sealed interface CurrentUserFetchResult {
    data class Success(val user: UserInfo) : CurrentUserFetchResult
    data object Unauthorized : CurrentUserFetchResult
    data object TemporaryFailure : CurrentUserFetchResult
}

interface SessionPersistence {
    val hasSession: Boolean
    val generation: Long
    fun captureSession(): SessionGenerationSnapshot?
    fun isCurrent(snapshot: SessionGenerationSnapshot): Boolean
    fun cachedUser(): UserInfo?
    fun authenticateIfCurrent(snapshot: SessionGenerationSnapshot, user: UserInfo): Boolean
    fun updateProfileIfCurrent(
        snapshot: SessionGenerationSnapshot,
        fullName: String,
        phone: String?
    ): Boolean
    fun clearIfCurrent(snapshot: SessionGenerationSnapshot): Long?
    fun clear()
}

fun interface CurrentUserFetcher {
    suspend fun fetch(): CurrentUserFetchResult
}

fun interface SessionRevoker {
    suspend fun revoke(): Boolean
}

data class SessionLogoutOutcome(
    val serverRevocationVerified: Boolean,
    val initiatingSessionCleared: Boolean
)

/**
 * Owns session startup and teardown decisions independently from Android UI lifecycles.
 * A bootstrap clears durable credentials only for an explicit unauthorized response.
 */
class SessionLifecycleCoordinator(
    private val persistence: SessionPersistence,
    private val currentUserFetcher: CurrentUserFetcher,
    private val sessionRevoker: SessionRevoker
) {
    private val stateLock = Any()
    private var stateGeneration: Long = persistence.generation

    @Volatile
    var state: SessionBootstrapState = SessionBootstrapState.Unknown
        private set

    suspend fun bootstrap(): SessionBootstrapState {
        val snapshot = persistence.captureSession()
        if (snapshot == null) {
            publish(persistence.generation, SessionBootstrapState.Guest)
            return state
        }

        when (val result = currentUserFetcher.fetch()) {
            is CurrentUserFetchResult.Success -> {
                if (persistence.authenticateIfCurrent(snapshot, result.user)) {
                    publish(snapshot.generation, SessionBootstrapState.Authenticated(result.user))
                }
            }
            CurrentUserFetchResult.Unauthorized -> {
                val clearedGeneration = persistence.clearIfCurrent(snapshot)
                if (clearedGeneration != null) {
                    publish(clearedGeneration, SessionBootstrapState.Guest)
                } else if (!persistence.hasSession) {
                    publish(persistence.generation, SessionBootstrapState.Guest)
                }
            }
            CurrentUserFetchResult.TemporaryFailure -> {
                if (persistence.isCurrent(snapshot)) {
                    publish(
                        snapshot.generation,
                        SessionBootstrapState.TemporaryFailure(persistence.cachedUser())
                    )
                }
            }
        }
        return state
    }

    fun markAuthenticated(user: UserInfo) {
        val snapshot = persistence.captureSession() ?: return
        publish(snapshot.generation, SessionBootstrapState.Authenticated(user))
    }

    suspend fun logout(): SessionLogoutOutcome {
        val owner = persistence.captureSession()
        if (owner == null) {
            val observedGeneration = persistence.generation
            if (!persistence.hasSession) {
                publish(observedGeneration, SessionBootstrapState.Guest)
            }
            return SessionLogoutOutcome(
                serverRevocationVerified = false,
                initiatingSessionCleared = !persistence.hasSession
            )
        }

        var initiatingSessionCleared = false
        val verified = try {
            sessionRevoker.revoke()
        } catch (_: Exception) {
            false
        } finally {
            val clearedGeneration = persistence.clearIfCurrent(owner)
            if (clearedGeneration != null) {
                initiatingSessionCleared = true
                publish(clearedGeneration, SessionBootstrapState.Guest)
            }
        }
        return SessionLogoutOutcome(
            serverRevocationVerified = verified,
            initiatingSessionCleared = initiatingSessionCleared
        )
    }

    private fun publish(generation: Long, newState: SessionBootstrapState) {
        synchronized(stateLock) {
            if (generation < stateGeneration) return
            stateGeneration = generation
            state = newState
        }
    }
}
