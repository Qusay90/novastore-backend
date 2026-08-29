package com.novastore.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Set;
import org.junit.Test;

public final class NovaCustomerSessionPluginTest {
    @Test
    public void completeAndLegacyCredentialEnvelopesAreBounded() {
        assertTrue(NovaCustomerSessionPlugin.validSessionEnvelope(
            Set.of("accessToken", "refreshToken", "accessExpiresAt", "refreshExpiresAt", "sessionId"),
            "access-token-0123456789", "refresh-token-0123456789",
            "2099-01-01T00:00:00.000Z", "2099-02-01T00:00:00.000Z", 41
        ));
        assertTrue(NovaCustomerSessionPlugin.validSessionEnvelope(
            Set.of("accessToken"), "legacy-access-0123456789", "", "", "", null
        ));
        assertFalse(NovaCustomerSessionPlugin.validSessionEnvelope(
            Set.of("accessToken", "refreshToken", "accessExpiresAt", "refreshExpiresAt", "sessionId", "userId"),
            "access-token-0123456789", "refresh-token-0123456789",
            "2099-01-01T00:00:00.000Z", "2099-02-01T00:00:00.000Z", 41
        ));
    }

    @Test
    public void malformedCredentialsAndTimestampsFailClosed() {
        assertNull(NovaCustomerSessionPlugin.canonicalCredential("short"));
        assertNull(NovaCustomerSessionPlugin.canonicalCredential("access token with spaces"));
        assertTrue(NovaCustomerSessionPlugin.canonicalCredential("access-token-0123456789") != null);
        assertNull(NovaCustomerSessionPlugin.canonicalTimestamp("not-a-time"));
        assertTrue(NovaCustomerSessionPlugin.canonicalTimestamp("2099-01-01T00:00:00.000Z") != null);
    }
}
