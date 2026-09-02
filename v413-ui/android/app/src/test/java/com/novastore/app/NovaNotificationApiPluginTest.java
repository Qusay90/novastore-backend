package com.novastore.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Set;

import org.junit.Test;

public final class NovaNotificationApiPluginTest {
    @Test
    public void canonicalPathsAndMethodsAreBounded() {
        assertEquals("/api/notifications?limit=50&cursor=abc_123", NovaNotificationApiPlugin.canonicalPath("/api/notifications?limit=50&cursor=abc_123"));
        assertEquals("PATCH", NovaNotificationApiPlugin.canonicalMethod(" patch "));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/notifications/42/read", "PATCH"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/notifications/android-push/tokens", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/notifications/android-push/tokens/session", "DELETE"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/users/refresh", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/orders/user/7", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/orders/7/cancel", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/returns/7", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/returns/mine", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/returns", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/payments/capability", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/payments/agreements/preview", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/payments/initialize", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/payments/status?paymentRef=PAYTR-abc_123&orderId=7", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/questions/user", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/reviews/user/7", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/messages/history/7", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/products/7", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/users/me", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/users/me", "PATCH"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/users/register", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/users/security-status", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/addresses", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/addresses", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/addresses/7", "PUT"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/addresses/7/default", "PATCH"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/addresses/7", "DELETE"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/messages/send", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/campaigns/coupons/active", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/store-follows", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/favorites", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/favorites/71", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/favorites/71", "DELETE"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/users/change-password", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/questions/ask", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/reviews", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/assistant/chat", "POST"));
        assertTrue(NovaNotificationApiPlugin.optionalAuthentication("/api/assistant/chat", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/store-follows/main6v-nova-teknoloji", "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/store-follows/main6v-nova-teknoloji", "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/store-follows/main6v-nova-teknoloji", "DELETE"));
        final String longestStoreSlug = "a".repeat(160);
        assertTrue(NovaNotificationApiPlugin.allowed("/api/store-follows/" + longestStoreSlug, "GET"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/store-follows/" + longestStoreSlug, "POST"));
        assertTrue(NovaNotificationApiPlugin.allowed("/api/store-follows/" + longestStoreSlug, "DELETE"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/store-follows/" + longestStoreSlug + "a", "GET"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/admin/notifications", "GET"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/addresses/7", "PATCH"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/addresses/0", "DELETE"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/notifications/0/read", "PATCH"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/orders/user/0", "GET"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/orders/0/cancel", "POST"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/messages/history/7", "POST"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/users/refresh", "GET"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/assistant/chat", "GET"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/assistant/escalate", "POST"));
        assertFalse(NovaNotificationApiPlugin.optionalAuthentication("/api/messages/send", "POST"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/store-follows/Main6v-Nova", "DELETE"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/store-follows/-main6v", "DELETE"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/store-follows/main6v-", "DELETE"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/store-follows/main6v--nova", "DELETE"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/store-follows/main6v-nova-teknoloji", "PUT"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/store-follows/nova%2Faudio", "GET"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/store-follows", "DELETE"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/favorites/0", "POST"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/favorites/71?debug=1", "POST"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/favorites/71", "GET"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/questions/ask", "GET"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/reviews", "GET"));
        assertFalse(NovaNotificationApiPlugin.allowed("/api/campaigns/coupons/active", "POST"));
        assertNull(NovaNotificationApiPlugin.canonicalPath("/api/assistant/chat?mode=buddy"));
        assertNull(NovaNotificationApiPlugin.canonicalPath("/api/store-follows/main6v?redirect=evil"));
        assertNull(NovaNotificationApiPlugin.canonicalPath("/api/store-follows/main6v%2Fadmin"));
    }

    @Test
    public void paymentStatusQueriesAndProviderUrlsAreStrictlyBounded() {
        assertEquals(
            "/api/payments/status?paymentRef=PAYTR-abc_123&orderId=7",
            NovaNotificationApiPlugin.canonicalPath("/api/payments/status?paymentRef=PAYTR-abc_123&orderId=7")
        );
        assertNull(NovaNotificationApiPlugin.canonicalPath("/api/payments/status?paymentRef=https://evil.invalid"));
        assertNull(NovaNotificationApiPlugin.canonicalPath("/api/payments/status?paymentRef=ok&userId=7"));
        assertTrue(NovaNotificationApiPlugin.isApprovedPaymentUrl("https://www.paytr.com/odeme/guvenli/token-123"));
        assertFalse(NovaNotificationApiPlugin.isApprovedPaymentUrl("http://www.paytr.com/odeme/guvenli/token-123"));
        assertFalse(NovaNotificationApiPlugin.isApprovedPaymentUrl("https://www.paytr.com.evil.invalid/odeme/guvenli/token-123"));
        assertFalse(NovaNotificationApiPlugin.isApprovedPaymentUrl("https://www.paytr.com/odeme/guvenli/"));
    }

    @Test
    public void crossOriginTraversalAndQueryConfusionFailClosed() {
        for (String invalid : new String[] {
            "https://evil.invalid/api/notifications",
            "//evil.invalid/api/notifications",
            "/api/notifications?url=https://evil.invalid",
            "/api/notifications?limit=101",
            "/api/notifications?limit=50&limit=20",
            "/api/notifications?cursor=abc&cursor=def",
            "/api/notifications/../admin",
            "/api/notifications#fragment"
        }) assertNull(invalid, NovaNotificationApiPlugin.canonicalPath(invalid));
    }

    @Test
    public void bearerTokensAreTrimmedBoundedAndSingleValue() {
        String valid = "0123456789abcdef0123456789abcdef";
        assertEquals(valid, NovaNotificationApiPlugin.canonicalToken("  " + valid + "  "));
        assertNull(NovaNotificationApiPlugin.canonicalToken("short"));
        assertNull(NovaNotificationApiPlugin.canonicalToken("0123456789abcdef embedded"));
        assertNull(NovaNotificationApiPlugin.canonicalToken(null));
    }

    @Test
    public void refreshEnvelopeIsExactAndIdentityFree() {
        assertTrue(NovaNotificationApiPlugin.validRefreshEnvelope(
            Set.of("refreshToken", "sessionId"), "refresh-token-0123456789", 17
        ));
        assertFalse(NovaNotificationApiPlugin.validRefreshEnvelope(
            Set.of("refreshToken", "sessionId", "userId"), "refresh-token-0123456789", 17
        ));
        assertFalse(NovaNotificationApiPlugin.validRefreshEnvelope(
            Set.of("refreshToken", "sessionId"), "refresh-token-0123456789", 17.5
        ));
    }
}
