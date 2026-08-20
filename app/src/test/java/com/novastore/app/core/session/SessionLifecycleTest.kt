package com.novastore.app.core.session

import com.novastore.app.data.model.UserInfo
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionLifecycleTest {
    private val user = UserInfo(
        id = 7,
        fullName = "Nova Customer",
        email = "customer@example.test",
        phone = "05550000000",
        emailVerified = true,
        phoneVerified = false
    )

    @Test
    fun `starts unknown and becomes guest without a durable session`() = runBlocking {
        val persistence = FakePersistence(hasSession = false)
        var fetchCount = 0
        val coordinator = coordinator(
            persistence = persistence,
            fetch = {
                fetchCount += 1
                CurrentUserFetchResult.Success(user)
            }
        )

        assertSame(SessionBootstrapState.Unknown, coordinator.state)
        assertSame(SessionBootstrapState.Guest, coordinator.bootstrap())
        assertEquals(0, fetchCount)
        assertEquals(0, persistence.clearCount)
    }

    @Test
    fun `successful me bootstrap authenticates and refreshes cached user`() = runBlocking {
        val persistence = FakePersistence(hasSession = true)
        val coordinator = coordinator(
            persistence = persistence,
            fetch = { CurrentUserFetchResult.Success(user) }
        )

        assertEquals(SessionBootstrapState.Authenticated(user), coordinator.bootstrap())
        assertEquals(user, persistence.user)
        assertTrue(persistence.validatedAuthenticated)
        assertEquals(0, persistence.clearCount)
    }

    @Test
    fun `401 bootstrap clears credentials and becomes guest`() = runBlocking {
        val persistence = FakePersistence(hasSession = true, user = user)
        val coordinator = coordinator(
            persistence = persistence,
            fetch = { CurrentUserFetchResult.Unauthorized }
        )

        assertSame(SessionBootstrapState.Guest, coordinator.bootstrap())
        assertFalse(persistence.hasSession)
        assertNull(persistence.user)
        assertEquals(1, persistence.clearCount)
    }

    @Test
    fun `transient bootstrap failure preserves credentials and cached user`() = runBlocking {
        val persistence = FakePersistence(hasSession = true, user = user)
        val coordinator = coordinator(
            persistence = persistence,
            fetch = { CurrentUserFetchResult.TemporaryFailure }
        )

        assertEquals(SessionBootstrapState.TemporaryFailure(user), coordinator.bootstrap())
        assertFalse(coordinator.state.isAuthenticatedForUi)
        assertFalse(persistence.validatedAuthenticated)
        assertTrue(persistence.hasSession)
        assertEquals(user, persistence.user)
        assertEquals(0, persistence.clearCount)
    }

    @Test
    fun `bootstrap retry after a transient failure is deterministic`() = runBlocking {
        val persistence = FakePersistence(hasSession = true, user = user)
        var fetchCount = 0
        val coordinator = coordinator(
            persistence = persistence,
            fetch = {
                fetchCount += 1
                if (fetchCount == 1) {
                    CurrentUserFetchResult.TemporaryFailure
                } else {
                    CurrentUserFetchResult.Success(user)
                }
            }
        )

        assertEquals(SessionBootstrapState.TemporaryFailure(user), coordinator.bootstrap())
        assertFalse(persistence.validatedAuthenticated)
        assertEquals(SessionBootstrapState.Authenticated(user), coordinator.bootstrap())
        assertTrue(coordinator.state.isAuthenticatedForUi)
        assertTrue(persistence.validatedAuthenticated)
        assertEquals(2, fetchCount)
        assertEquals(0, persistence.clearCount)
    }

    @Test
    fun `delayed 401 from session A cannot clear newer session B`() = runBlocking {
        val userB = user.copy(id = 8, email = "new-session@example.test")
        val persistence = FakePersistence(hasSession = true, user = user)
        lateinit var coordinator: SessionLifecycleCoordinator
        coordinator = coordinator(
            persistence = persistence,
            fetch = {
                persistence.replaceSession(userB)
                coordinator.markAuthenticated(userB)
                CurrentUserFetchResult.Unauthorized
            }
        )

        coordinator.bootstrap()

        assertTrue(persistence.hasSession)
        assertEquals(userB, persistence.user)
        assertEquals(SessionBootstrapState.Authenticated(userB), coordinator.state)
        assertEquals(0, persistence.clearCount)
    }

    @Test
    fun `delayed 200 from session A cannot overwrite newer session B`() = runBlocking {
        val userB = user.copy(id = 8, email = "new-session@example.test")
        val persistence = FakePersistence(hasSession = true, user = user)
        lateinit var coordinator: SessionLifecycleCoordinator
        coordinator = coordinator(
            persistence = persistence,
            fetch = {
                persistence.replaceSession(userB)
                coordinator.markAuthenticated(userB)
                CurrentUserFetchResult.Success(user)
            }
        )

        coordinator.bootstrap()

        assertEquals(userB, persistence.user)
        assertEquals(SessionBootstrapState.Authenticated(userB), coordinator.state)
    }

    @Test
    fun `profile completion updates only the session that captured it`() {
        val persistence = FakePersistence(hasSession = true, user = user)
        val owner = requireNotNull(persistence.captureSession())

        assertTrue(
            persistence.updateProfileIfCurrent(
                owner,
                fullName = "Nova Customer Updated",
                phone = "05551112233"
            )
        )
        assertEquals("Nova Customer Updated", persistence.user?.fullName)
        assertEquals("05551112233", persistence.user?.phone)
        assertEquals(user.id, persistence.user?.id)
        assertEquals(user.email, persistence.user?.email)
    }

    @Test
    fun `delayed profile completion from A cannot overwrite session B`() {
        val userB = user.copy(
            id = 8,
            fullName = "Customer B",
            email = "customer-b@example.test",
            phone = "05550000008"
        )
        val persistence = FakePersistence(hasSession = true, user = user)
        val ownerA = requireNotNull(persistence.captureSession())
        persistence.replaceSession(userB)

        assertFalse(
            persistence.updateProfileIfCurrent(
                ownerA,
                fullName = "Customer A Updated",
                phone = "05550000009"
            )
        )
        assertEquals(userB, persistence.user)
    }

    @Test
    fun `logout rejects a delayed profile completion without a replacement login`() {
        val persistence = FakePersistence(hasSession = true, user = user)
        val owner = requireNotNull(persistence.captureSession())
        persistence.clear()

        assertFalse(
            persistence.updateProfileIfCurrent(
                owner,
                fullName = "Stale Name",
                phone = "05550000009"
            )
        )
        assertNull(persistence.user)
    }

    @Test
    fun `reused token text cannot revive an older profile generation`() {
        val userB = user.copy(
            id = 9,
            fullName = "Customer B",
            email = "customer-b@example.test",
            phone = "05550000009"
        )
        val persistence = FakePersistence(hasSession = true, user = user)
        val ownerA = requireNotNull(persistence.captureSession())
        persistence.replaceSession(userB, tokenOverride = ownerA.token)

        assertFalse(
            persistence.updateProfileIfCurrent(
                ownerA,
                fullName = "Customer A Updated",
                phone = "05550000001"
            )
        )
        assertEquals(userB, persistence.user)
    }

    @Test
    fun `one logout action makes one revoke request and always clears locally`() = runBlocking {
        val persistence = FakePersistence(hasSession = true, user = user)
        var revokeCount = 0
        val coordinator = coordinator(
            persistence = persistence,
            revoke = {
                revokeCount += 1
                true
            }
        )

        val result = coordinator.logout()

        assertTrue(result.serverRevocationVerified)
        assertTrue(result.initiatingSessionCleared)
        assertEquals(1, revokeCount)
        assertEquals(1, persistence.clearCount)
        assertSame(SessionBootstrapState.Guest, coordinator.state)
    }

    @Test
    fun `failed revoke still clears local credentials`() = runBlocking {
        val persistence = FakePersistence(hasSession = true, user = user)
        var revokeCount = 0
        val coordinator = coordinator(
            persistence = persistence,
            revoke = {
                revokeCount += 1
                throw IllegalStateException("offline")
            }
        )

        val result = coordinator.logout()

        assertFalse(result.serverRevocationVerified)
        assertTrue(result.initiatingSessionCleared)
        assertEquals(1, revokeCount)
        assertFalse(persistence.hasSession)
        assertEquals(1, persistence.clearCount)
    }

    @Test
    fun `delayed logout from A cannot clear or publish guest over session B`() = runBlocking {
        val userB = user.copy(
            id = 8,
            fullName = "Customer B",
            email = "customer-b@example.test",
            phone = "05550000008"
        )
        val persistence = FakePersistence(hasSession = true, user = user)
        lateinit var coordinator: SessionLifecycleCoordinator
        coordinator = coordinator(
            persistence = persistence,
            revoke = {
                persistence.replaceSession(userB)
                coordinator.markAuthenticated(userB)
                true
            }
        )

        val result = coordinator.logout()

        assertTrue(result.serverRevocationVerified)
        assertFalse(result.initiatingSessionCleared)
        assertTrue(persistence.hasSession)
        assertEquals(userB, persistence.user)
        assertEquals(SessionBootstrapState.Authenticated(userB), coordinator.state)
        assertEquals(0, persistence.clearCount)
    }

    private fun coordinator(
        persistence: FakePersistence,
        fetch: suspend () -> CurrentUserFetchResult = {
            CurrentUserFetchResult.TemporaryFailure
        },
        revoke: suspend () -> Boolean = { false }
    ) = SessionLifecycleCoordinator(
        persistence = persistence,
        currentUserFetcher = CurrentUserFetcher { fetch() },
        sessionRevoker = SessionRevoker { revoke() }
    )

    private class FakePersistence(
        override var hasSession: Boolean,
        var user: UserInfo? = null,
        var validatedAuthenticated: Boolean = false
    ) : SessionPersistence {
        override var generation: Long = 0L
        var clearCount = 0
        private var token: String? = if (hasSession) tokenFor(user) else null

        override fun cachedUser(): UserInfo? = user

        override fun captureSession(): SessionGenerationSnapshot? =
            token?.let { SessionGenerationSnapshot(it, generation) }

        override fun isCurrent(snapshot: SessionGenerationSnapshot): Boolean =
            hasSession && generation == snapshot.generation && token == snapshot.token

        override fun authenticateIfCurrent(
            snapshot: SessionGenerationSnapshot,
            user: UserInfo
        ): Boolean {
            if (!isCurrent(snapshot)) return false
            this.user = user
            validatedAuthenticated = hasSession
            return true
        }

        override fun updateProfileIfCurrent(
            snapshot: SessionGenerationSnapshot,
            fullName: String,
            phone: String?
        ): Boolean {
            if (!isCurrent(snapshot)) return false
            user = user?.copy(fullName = fullName, phone = phone)
            return true
        }

        override fun clearIfCurrent(snapshot: SessionGenerationSnapshot): Long? {
            if (!isCurrent(snapshot)) return null
            clear()
            return generation
        }

        fun replaceSession(user: UserInfo, tokenOverride: String? = null) {
            generation += 1
            hasSession = true
            this.user = user
            token = tokenOverride ?: tokenFor(user)
            validatedAuthenticated = true
        }

        override fun clear() {
            clearCount += 1
            generation += 1
            hasSession = false
            user = null
            token = null
            validatedAuthenticated = false
        }

        private fun tokenFor(user: UserInfo?): String = "token-${user?.id ?: "stored"}"
    }
}
