package com.novastore.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.net.URI;
import org.junit.Test;

public final class NovaPublicStorePluginTest {
    @Test
    public void storeSlugIsCanonicalAndTraversalFailsClosed() {
        assertEquals("main6v-nova-teknoloji", NovaPublicStorePlugin.canonicalSlug(" MAIN6V-NOVA-TEKNOLOJI "));
        for (String invalid : new String[] {"", "../seller/private", "seller_private", "-leading", "two--dashes"}) {
            assertNull(invalid, NovaPublicStorePlugin.canonicalSlug(invalid));
        }
    }

    @Test
    public void debugUatAndReleaseOriginsAreExactAndDoNotOverlap() {
        URI debug = URI.create("http://10.0.2.2:5000/");
        URI uat = URI.create("http://127.0.0.1:5000/");
        URI release = URI.create("https://novastore.tr/");
        assertTrue(NovaPublicStorePlugin.isApprovedApiBase(debug, true, false));
        assertFalse(NovaPublicStorePlugin.isApprovedApiBase(debug, false, false));
        assertFalse(NovaPublicStorePlugin.isApprovedApiBase(debug, false, true));
        assertTrue(NovaPublicStorePlugin.isApprovedApiBase(uat, false, true));
        assertTrue(NovaPublicStorePlugin.isApprovedApiBase(uat, true, true));
        assertFalse(NovaPublicStorePlugin.isApprovedApiBase(uat, true, false));
        assertFalse(NovaPublicStorePlugin.isApprovedApiBase(uat, false, false));
        assertTrue(NovaPublicStorePlugin.isApprovedApiBase(release, false, false));
        assertFalse(NovaPublicStorePlugin.isApprovedApiBase(release, true, false));
        assertFalse(NovaPublicStorePlugin.isApprovedApiBase(release, false, true));
        assertFalse(NovaPublicStorePlugin.isApprovedApiBase(release, true, true));
        assertEquals("http://10.0.2.2:5000", NovaPublicStorePlugin.apiOrigin(debug));
        assertEquals("http://127.0.0.1:5000", NovaPublicStorePlugin.apiOrigin(uat));
        assertEquals("https://novastore.tr", NovaPublicStorePlugin.apiOrigin(release));
    }

    @Test
    public void originConfusionAndPathInjectionAreRejected() {
        for (String invalid : new String[] {
            "http://127.0.0.1:5001/",
            "http://localhost:5000/",
            "http://127.0.0.2:5000/",
            "http://127.0.0.1:5000/api/private/",
            "http://127.0.0.1:5000/?token=secret",
            "http://10.0.2.2:5001/",
            "http://10.0.2.2:5000/api/private/",
            "http://10.0.2.2:5000/?token=secret",
            "https://novastore.tr.evil/",
            "https://novastore.tr:443/",
            "https://user@novastore.tr/"
        }) {
            URI candidate = URI.create(invalid);
            assertFalse(invalid, NovaPublicStorePlugin.isApprovedApiBase(candidate, true, false));
            assertFalse(invalid, NovaPublicStorePlugin.isApprovedApiBase(candidate, false, true));
            assertFalse(invalid, NovaPublicStorePlugin.isApprovedApiBase(candidate, false, false));
        }
    }
}
