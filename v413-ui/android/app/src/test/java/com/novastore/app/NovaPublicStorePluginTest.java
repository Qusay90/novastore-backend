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
    public void debugAndReleaseOriginsAreExactAndDoNotOverlap() {
        URI debug = URI.create("http://10.0.2.2:5000/");
        URI release = URI.create("https://novastore.tr/");
        assertTrue(NovaPublicStorePlugin.isApprovedApiBase(debug, true));
        assertFalse(NovaPublicStorePlugin.isApprovedApiBase(debug, false));
        assertTrue(NovaPublicStorePlugin.isApprovedApiBase(release, false));
        assertFalse(NovaPublicStorePlugin.isApprovedApiBase(release, true));
        assertEquals("http://10.0.2.2:5000", NovaPublicStorePlugin.apiOrigin(debug));
        assertEquals("https://novastore.tr", NovaPublicStorePlugin.apiOrigin(release));
    }

    @Test
    public void originConfusionAndPathInjectionAreRejected() {
        for (String invalid : new String[] {
            "http://127.0.0.1:5000/",
            "http://10.0.2.2:5001/",
            "http://10.0.2.2:5000/api/private/",
            "http://10.0.2.2:5000/?token=secret",
            "https://novastore.tr.evil/",
            "https://novastore.tr:443/",
            "https://user@novastore.tr/"
        }) {
            URI candidate = URI.create(invalid);
            assertFalse(invalid, NovaPublicStorePlugin.isApprovedApiBase(candidate, true));
            assertFalse(invalid, NovaPublicStorePlugin.isApprovedApiBase(candidate, false));
        }
    }
}
