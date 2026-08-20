package com.novastore.app.data.model

import com.novastore.app.core.network.NovaStoreApi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.http.POST

class CustomerAuthContractTest {
    @Test
    fun `login and reset requests use email or phone identifier`() {
        assertEquals("05550000000", LoginRequest("05550000000", "secret").identifier)
        assertEquals(
            "customer@example.test",
            PasswordResetCodeRequest("customer@example.test").identifier
        )
    }

    @Test
    fun `register and user contracts carry optional phone and verification flags`() {
        val register = RegisterRequest(
            fullName = "Nova Customer",
            email = "customer@example.test",
            password = "secret",
            phone = "05550000000"
        )
        val legacyCompatibleUser = UserInfo(
            id = 1,
            fullName = "Nova Customer",
            email = "customer@example.test"
        )

        assertEquals("05550000000", register.phone)
        assertNull(RegisterRequest("Nova Customer", "customer@example.test", "secret").phone)
        assertFalse(legacyCompatibleUser.emailVerified)
        assertFalse(legacyCompatibleUser.phoneVerified)
    }

    @Test
    fun `verification and reset accept exactly six digits`() {
        assertTrue(CustomerVerificationCode.isValid("012345"))
        assertFalse(CustomerVerificationCode.isValid("12345"))
        assertFalse(CustomerVerificationCode.isValid("1234567"))
        assertFalse(CustomerVerificationCode.isValid("12345A"))
    }

    @Test
    fun `reset completion carries optional all-session revocation choice`() {
        val request = PasswordResetCompletionRequest(
            identifier = "05550000000",
            code = "012345",
            newPassword = "new-password-1",
            logoutAll = true
        )

        assertEquals("012345", request.code)
        assertTrue(request.logoutAll == true)
    }

    @Test
    fun `reset verification response carries validity and expiry`() {
        val response = PasswordResetCodeVerificationResponse(
            valid = true,
            expiresAt = "2026-07-28T17:30:00.000Z",
            message = "Kod doğrulandı."
        )

        assertTrue(response.valid)
        assertEquals("2026-07-28T17:30:00.000Z", response.expiresAt)
        assertEquals("Kod doğrulandı.", response.message)
    }

    @Test
    fun `api methods match coordinated customer auth paths`() {
        assertPost("sendEmailVerification", "api/users/verification/email/send")
        assertPost("verifyEmailCode", "api/users/verification/email/verify")
        assertPost("sendPhoneCode", "api/users/verification/phone/send")
        assertPost("verifyPhoneCode", "api/users/verification/phone/verify")
        assertPost("requestPasswordReset", "api/users/password-reset/request")
        assertPost("verifyPasswordResetCode", "api/users/password-reset/verify")
        assertPost("completePasswordReset", "api/users/password-reset/complete")
    }

    private fun assertPost(methodName: String, expectedPath: String) {
        val method = NovaStoreApi::class.java.declaredMethods.single { it.name == methodName }
        assertEquals(expectedPath, method.getAnnotation(POST::class.java)?.value)
    }
}
