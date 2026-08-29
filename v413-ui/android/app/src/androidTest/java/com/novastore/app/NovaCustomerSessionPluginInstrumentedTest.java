package com.novastore.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.util.Base64;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.PluginHandle;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class NovaCustomerSessionPluginInstrumentedTest {
    private static final int CONCURRENT_WRITERS = 6;
    private static final long AWAIT_SECONDS = 10L;
    private Context context;

    @Before
    public void resetBefore() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        resetSecureStore();
    }

    @After
    public void resetAfter() throws Exception {
        resetSecureStore();
    }

    @Test
    public void replaceThenLoadUsesCiphertextAndNoPlaintext() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            NovaCustomerSessionPlugin plugin = pluginFrom(scenario);
            JSONObject source = session("alpha", 41L);
            JSONObject replaced = plugin.replaceStoredEnvelope(0L, source);

            assertEquals(1L, replaced.getLong("generation"));
            JSONObject loaded = plugin.loadStoredEnvelope();
            assertEquals(1L, loaded.getLong("generation"));
            assertEquals(source.getString("accessToken"), loaded.getJSONObject("session").getString("accessToken"));
            assertEquals(source.getString("refreshToken"), loaded.getJSONObject("session").getString("refreshToken"));

            String raw = rawEnvelope();
            assertNotNull(raw);
            assertTrue(Base64.decode(raw, Base64.NO_WRAP).length > 12);
            assertFalse(raw.contains(source.getString("accessToken")));
            assertFalse(raw.contains(source.getString("refreshToken")));
            assertFalse(raw.contains("accessToken"));
            assertFalse(raw.contains("refreshToken"));
            assertTrue(keyStore().containsAlias(NovaCustomerSessionPlugin.KEY_ALIAS));
        }
    }

    @Test
    public void staleReplaceAndClearCannotChangeCiphertext() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            NovaCustomerSessionPlugin plugin = pluginFrom(scenario);
            plugin.replaceStoredEnvelope(0L, session("first", 51L));
            String before = rawEnvelope();

            assertStorageCode(
                "CUSTOMER_SESSION_GENERATION_STALE",
                () -> plugin.replaceStoredEnvelope(0L, session("stale", 52L))
            );
            assertStorageCode("CUSTOMER_SESSION_GENERATION_STALE", () -> plugin.clearStoredEnvelope(0L));
            assertEquals(before, rawEnvelope());
            assertEquals(1L, plugin.loadStoredEnvelope().getLong("generation"));
        }
    }

    @Test
    public void tombstonePersistsAcrossActivityRecreation() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            NovaCustomerSessionPlugin plugin = pluginFrom(scenario);
            plugin.replaceStoredEnvelope(0L, session("logout", 61L));
            JSONObject cleared = plugin.clearStoredEnvelope(1L);
            assertEquals(2L, cleared.getLong("generation"));
            assertTrue(cleared.isNull("session"));

            String tombstoneCiphertext = rawEnvelope();
            assertNotNull(tombstoneCiphertext);
            assertFalse(tombstoneCiphertext.contains("logout"));
            scenario.recreate();

            JSONObject reloaded = pluginFrom(scenario).loadStoredEnvelope();
            assertEquals(2L, reloaded.getLong("generation"));
            assertTrue(reloaded.isNull("session"));
            assertEquals(tombstoneCiphertext, rawEnvelope());
        }
    }

    @Test
    public void corruptEnvelopeFailsClosedAndRecoversToEncryptedNonzeroTombstone() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            NovaCustomerSessionPlugin plugin = pluginFrom(scenario);
            assertEquals(0L, plugin.loadStoredEnvelope().getLong("generation"));
            String corrupt = "not-valid-base64-envelope";
            assertTrue(preferences().edit().putString(NovaCustomerSessionPlugin.ENVELOPE_KEY, corrupt).commit());

            assertStorageCode("CUSTOMER_SESSION_STORAGE_INVALID", plugin::loadStoredEnvelope);
            String recoveredCiphertext = rawEnvelope();
            assertNotNull(recoveredCiphertext);
            assertNotEquals(corrupt, recoveredCiphertext);
            assertTrue(Base64.decode(recoveredCiphertext, Base64.NO_WRAP).length > 12);
            assertFalse(recoveredCiphertext.contains("accessToken"));

            JSONObject recovered = plugin.loadStoredEnvelope();
            assertTrue(recovered.getLong("generation") > 0L);
            assertTrue(recovered.isNull("session"));
        }
    }

    @Test
    public void concurrentGenerationZeroReplaceHasExactlyOneWinner() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            NovaCustomerSessionPlugin plugin = pluginFrom(scenario);
            ExecutorService pool = Executors.newFixedThreadPool(CONCURRENT_WRITERS);
            CountDownLatch ready = new CountDownLatch(CONCURRENT_WRITERS);
            CountDownLatch start = new CountDownLatch(1);
            List<Future<String>> futures = new ArrayList<>();
            try {
                for (int index = 0; index < CONCURRENT_WRITERS; index++) {
                    final int writer = index;
                    futures.add(pool.submit(() -> {
                        ready.countDown();
                        if (!start.await(AWAIT_SECONDS, TimeUnit.SECONDS)) return "START_TIMEOUT";
                        try {
                            plugin.replaceStoredEnvelope(0L, session("writer-" + writer, 100L + writer));
                            return "SUCCESS";
                        } catch (NovaCustomerSessionPlugin.SessionStorageException failure) {
                            return failure.code;
                        }
                    }));
                }
                assertTrue(ready.await(AWAIT_SECONDS, TimeUnit.SECONDS));
                start.countDown();

                int successes = 0;
                int stale = 0;
                for (Future<String> future : futures) {
                    String result = future.get(AWAIT_SECONDS, TimeUnit.SECONDS);
                    if ("SUCCESS".equals(result)) successes++;
                    else if ("CUSTOMER_SESSION_GENERATION_STALE".equals(result)) stale++;
                    else fail("Unexpected concurrent result: " + result);
                }
                assertEquals(1, successes);
                assertEquals(CONCURRENT_WRITERS - 1, stale);
                JSONObject winner = plugin.loadStoredEnvelope();
                assertEquals(1L, winner.getLong("generation"));
                assertFalse(winner.isNull("session"));
            } finally {
                start.countDown();
                pool.shutdownNow();
                assertTrue(pool.awaitTermination(AWAIT_SECONDS, TimeUnit.SECONDS));
            }
        }
    }

    private NovaCustomerSessionPlugin pluginFrom(ActivityScenario<MainActivity> scenario) {
        awaitNativeBootstrap(scenario);
        AtomicReference<NovaCustomerSessionPlugin> result = new AtomicReference<>();
        scenario.onActivity(activity -> {
            PluginHandle handle = activity.getBridge().getPlugin("NovaCustomerSession");
            assertNotNull(handle);
            assertTrue(handle.getInstance() instanceof NovaCustomerSessionPlugin);
            result.set((NovaCustomerSessionPlugin) handle.getInstance());
        });
        assertNotNull(result.get());
        return result.get();
    }

    private void awaitNativeBootstrap(ActivityScenario<MainActivity> scenario) {
        long deadline = SystemClock.elapsedRealtime() + TimeUnit.SECONDS.toMillis(AWAIT_SECONDS);
        AtomicReference<WebView> webView = new AtomicReference<>();
        scenario.onActivity(activity -> webView.set(activity.getBridge().getWebView()));
        assertNotNull(webView.get());
        while (SystemClock.elapsedRealtime() < deadline) {
            AtomicReference<String> rendered = new AtomicReference<>();
            CountDownLatch evaluated = new CountDownLatch(1);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                webView.get().evaluateJavascript(
                    "Boolean(document.getElementById('root') && document.getElementById('root').childElementCount)",
                    value -> {
                        rendered.set(value);
                        evaluated.countDown();
                    }
                )
            );
            try {
                if (evaluated.await(2L, TimeUnit.SECONDS) && "true".equals(rendered.get())) return;
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                fail("Interrupted while waiting for bounded native bootstrap");
            }
            SystemClock.sleep(100L);
        }
        fail("Native customer bootstrap did not render within " + AWAIT_SECONDS + " seconds");
    }

    private JSONObject session(String suffix, long sessionId) throws Exception {
        JSONObject session = new JSONObject();
        session.put("accessToken", "access-token-0123456789-" + suffix);
        session.put("refreshToken", "refresh-token-0123456789-" + suffix);
        session.put("accessExpiresAt", "2099-01-01T00:00:00.000Z");
        session.put("refreshExpiresAt", "2099-02-01T00:00:00.000Z");
        session.put("sessionId", sessionId);
        return session;
    }

    private SharedPreferences preferences() {
        return context.getSharedPreferences(NovaCustomerSessionPlugin.PREFERENCES, Context.MODE_PRIVATE);
    }

    private String rawEnvelope() {
        return preferences().getString(NovaCustomerSessionPlugin.ENVELOPE_KEY, null);
    }

    private KeyStore keyStore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        return keyStore;
    }

    private void resetSecureStore() throws Exception {
        if (context != null) assertTrue(preferences().edit().clear().commit());
        KeyStore keyStore = keyStore();
        if (keyStore.containsAlias(NovaCustomerSessionPlugin.KEY_ALIAS)) {
            keyStore.deleteEntry(NovaCustomerSessionPlugin.KEY_ALIAS);
        }
    }

    private void assertStorageCode(String expected, ThrowingOperation operation) throws Exception {
        try {
            operation.run();
            fail("Expected storage failure " + expected);
        } catch (NovaCustomerSessionPlugin.SessionStorageException failure) {
            assertEquals(expected, failure.code);
        }
    }

    @FunctionalInterface
    private interface ThrowingOperation {
        void run() throws Exception;
    }
}
