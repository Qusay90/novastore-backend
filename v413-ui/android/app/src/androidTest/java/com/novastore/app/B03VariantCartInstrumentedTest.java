package com.novastore.app;

import static org.junit.Assert.*;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import com.getcapacitor.PluginHandle;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real native WebView and native HTTP bridge; fixture supplies synthetic login
 * only. Methods run independently to interleave real Web UI actions, preserving
 * the same account and server state throughout the cross-client sequence. */
@RunWith(AndroidJUnit4.class)
public final class B03VariantCartInstrumentedTest {
    @Test public void independentBobAddTwoVariantsAndRemoveWithoutSiblingLoss() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            login(scenario, loginFixture().getJSONObject("bob"));
            openCart(scenario); assertRows(scenario, "903");
            navigate(scenario, "/?cal=CAL-06&tab=home&productId=501&shell=native");
            waitFor(scenario, "!!document.querySelector('[data-testid=canonical-variant-901]')", "variant PDP missing");
            for (String variant : new String[] {"901", "902"}) {
                click(scenario, "[data-testid=canonical-variant-" + variant + "]");
                click(scenario, ".pdp-add-to-cart");
                waitFor(scenario, "document.querySelector('.pdp-add-to-cart')?.getAttribute('aria-pressed')==='true'", "native variant add failed");
                waitFor(scenario, "document.querySelector('.pdp-add-to-cart')?.getAttribute('aria-pressed')==='false'", "add feedback did not settle");
            }
            openCart(scenario); assertRows(scenario, "901,902,903");
            evidence(scenario, "bob-01-two-sibling-variants-and-other-store");
            scenario.recreate(); openCart(scenario); assertRows(scenario, "901,902,903");
            evidence(scenario, "bob-02-recreated-keeps-three-lines");
            click(scenario, "[data-variant-id='901'] .cart-item-actions button");
            assertRows(scenario, "902,903");
            evidence(scenario, "bob-03-remove901-keeps902-other-store");
            click(scenario, "[data-variant-id='902'] .cart-item-actions button");
            assertRows(scenario, "903");
        }
    }

    @Test public void independentBobColdRestartLegacyAndStaleMutationsCannotChangeV2() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openCart(scenario); assertRows(scenario, "903");
            evidence(scenario, "bob-04-cold-restart-server903");
            AtomicReference<NovaCustomerSessionPlugin> plugin = new AtomicReference<>();
            scenario.onActivity(activity -> { PluginHandle handle = activity.getBridge().getPlugin("NovaCustomerSession"); plugin.set((NovaCustomerSessionPlugin) handle.getInstance()); });
            String token = plugin.get().loadStoredEnvelope().getJSONObject("session").getString("accessToken");
            JSONObject before = api("GET", null, token, "2");
            assertEquals(200, before.getInt("status"));
            JSONObject state = before.getJSONObject("payload");
            JSONObject legacy = new JSONObject().put("payload", new JSONObject().put("version", 1).put("items", new JSONArray().put(new JSONObject().put("productId", 601).put("quantity", 9))));
            for (String method : new String[] {"GET", "PUT", "DELETE"}) {
                JSONObject rejected = api(method, "GET".equals(method) ? null : legacy, token, null);
                assertEquals("Legacy " + method, 426, rejected.getInt("status"));
                assertEquals("CART_CLIENT_UPGRADE_REQUIRED", rejected.getJSONObject("payload").getString("code"));
            }
            JSONObject stale = new JSONObject().put("expectedRevision", state.getLong("revision") - 1).put("payload", state.getJSONObject("payload"));
            assertEquals(409, api("PUT", stale, token, "2").getInt("status"));
            assertEquals(400, api("GET", null, token, "99").getInt("status"));
            JSONObject after = api("GET", null, token, "2").getJSONObject("payload");
            assertEquals(state.getLong("revision"), after.getLong("revision"));
            assertEquals(state.getJSONObject("payload").toString(), after.getJSONObject("payload").toString());
            evidence(scenario, "bob-05-legacy-and-stale-mutations-rejected");
        }
    }
    @Test public void cross01LoginAndObserveWeb901() throws Exception {
        assertEquals("com.novastore.app.b03cartuat", InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            login(scenario, loginFixture());
            openCart(scenario);
            assertRows(scenario, "901");
            evidence(scenario, "01-web901-visible-native");
        }
    }

    @Test public void cross02AddAndroid902AndObserveBoth() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openCart(scenario);
            assertRows(scenario, "901");
            navigate(scenario, "/?cal=CAL-06&tab=home&productId=501&shell=native");
            waitFor(scenario, "!!document.querySelector('[data-testid=canonical-variant-902]')", "canonical variant 902 missing");
            click(scenario, "[data-testid=canonical-variant-902]");
            click(scenario, ".pdp-add-to-cart");
            waitFor(scenario, "document.querySelector('.pdp-add-to-cart')?.getAttribute('aria-pressed')==='true'", "native add did not complete");
            openCart(scenario);
            assertRows(scenario, "901,902");
            evidence(scenario, "02-native-added902-two-lines");
            scenario.recreate();
            openCart(scenario);
            assertRows(scenario, "901,902");
            evidence(scenario, "03-recreated-two-lines");
        }
    }

    @Test public void cross03WebRemoved901NativeKeeps902() throws Exception {
        File receipt = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "b03/02-native-added902-two-lines.json");
        JSONObject captured;
        try (FileInputStream stream = new FileInputStream(receipt)) { captured = new JSONObject(new String(stream.readAllBytes(), StandardCharsets.UTF_8)); }
        long staleRevision = Long.parseLong(captured.getString("revision"));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<NovaCustomerSessionPlugin> plugin = new AtomicReference<>();
            scenario.onActivity(activity -> plugin.set((NovaCustomerSessionPlugin) activity.getBridge().getPlugin("NovaCustomerSession").getInstance()));
            String token = plugin.get().loadStoredEnvelope().getJSONObject("session").getString("accessToken");
            JSONArray oldItems = new JSONArray().put(new JSONObject().put("productId", 501).put("variantId", 901).put("quantity", 1)).put(new JSONObject().put("productId", 501).put("variantId", 902).put("quantity", 1));
            JSONObject stale = new JSONObject().put("expectedRevision", staleRevision).put("payload", new JSONObject().put("cartSchemaVersion", 2).put("items", oldItems));
            JSONObject rejected = api("PUT", stale, token, "2");
            assertEquals(409, rejected.getInt("status"));
            assertEquals("CART_REVISION_CONFLICT", rejected.getJSONObject("payload").getString("code"));
            JSONObject unchanged = api("GET", null, token, "2").getJSONObject("payload");
            assertTrue(unchanged.getLong("revision") > staleRevision);
            assertEquals(1, unchanged.getJSONObject("payload").getJSONArray("items").length());
            assertEquals(902, unchanged.getJSONObject("payload").getJSONArray("items").getJSONObject(0).getInt("variantId"));
            openCart(scenario);
            assertRows(scenario, "902");
            evidence(scenario, "04-web-remove901-native-only902");
        }
    }

    @Test public void browserStorageAuditAfterRealUsage() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitFor(scenario, "document.hasFocus()", "native window did not receive focus");
            String result = evaluate(scenario, "JSON.stringify({keys:Object.keys(localStorage),sessionCount:sessionStorage.length,cookie:document.cookie,secret:/bearer|refresh[_-]?token|access[_-]?token|authorization/i.test([...Object.entries(localStorage),...Object.entries(sessionStorage)].flat().join(' '))})");
            JSONObject audit = new JSONObject(new JSONArray("[" + result + "]").getString(0));
            File out = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "b03/storage-audit.json");
            try (FileOutputStream file = new FileOutputStream(out)) { file.write(audit.toString().getBytes(StandardCharsets.UTF_8)); }
            assertFalse("Browser storage contains credential patterns", audit.getBoolean("secret"));
            assertEquals(0, audit.getInt("sessionCount"));
            assertEquals("", audit.getString("cookie"));
            java.util.Set<String> allowed = new java.util.HashSet<>(java.util.Arrays.asList("novastore.android.installationId", "novastore.novabot.presentation.v1", "novastore.customer.cart.v1", "novastore.customer.variant-selection.v1"));
            for (int i = 0; i < audit.getJSONArray("keys").length(); i++) assertTrue("Unexpected browser key", allowed.contains(audit.getJSONArray("keys").getString(i)));
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            // Do not close a just-launched cold WebView while its initial
            // surface/focus transition is still being committed by Android.
            SystemClock.sleep(1000);
        }
    }

    @Test public void cross04ColdRestartKeeps902() throws Exception {
        // The runner starts this method after adb force-stop, so both the JS
        // process and native account provider are reconstructed from disk.
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openCart(scenario);
            assertRows(scenario, "902");
            evidence(scenario, "05-cold-restart-only902");
        }
    }

    @Test public void cross05LogoutSwitchAccountAndReturnRetainsServerCart() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            login(scenario, loginFixture());
            openCart(scenario);
            assertRows(scenario, "902");
            navigate(scenario, "/?cal=CAL-10&tab=account&shell=native");
            waitFor(scenario, "!!document.querySelector('button.logout')", "account logout missing");
            click(scenario, "button.logout");
            waitFor(scenario, "!!document.querySelector('input[name=identifier]')", "logout did not finish");
            login(scenario, loginFixture().getJSONObject("bob"));
            openCart(scenario);
            assertRows(scenario, "903");
            evidence(scenario, "07-bob-isolated-903");
            login(scenario, loginFixture());
            openCart(scenario);
            assertRows(scenario, "902");
            evidence(scenario, "08-alice-relogin-retains902");
        }
    }

    @Test public void nativeRemoveOneSiblingKeepsTheOther() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openCart(scenario);
            assertRows(scenario, "901,902");
            click(scenario, "[data-variant-id='901'] .cart-item-actions button");
            assertRows(scenario, "902");
            evidence(scenario, "06-native-remove901-keeps902");
        }
    }

    private static void openCart(ActivityScenario<MainActivity> scenario) throws Exception {
        navigate(scenario, "/?cal=CAL-07&tab=cart&shell=native");
        waitFor(scenario, "!!document.querySelector('.cart-layout') && document.querySelector('.cart-layout').getAttribute('data-cart-revision')!==null && document.querySelector('.cart-layout').getAttribute('aria-busy')==='false'", "server V2 cart did not load");
    }
    private static void assertRows(ActivityScenario<MainActivity> scenario, String expected) throws Exception {
        waitFor(scenario, "[...document.querySelectorAll('.cart-item')].map(n=>n.dataset.variantId||'none').sort().join(',')===" + JSONObject.quote(expected), "native cart identities did not match " + expected);
    }
    private static void navigate(ActivityScenario<MainActivity> scenario, String location) throws Exception {
        evaluate(scenario, "history.replaceState({novastoreDepth:0},''," + JSONObject.quote(location) + ");dispatchEvent(new PopStateEvent('popstate'));true");
    }
    private static void click(ActivityScenario<MainActivity> scenario, String selector) throws Exception {
        assertEquals("click target missing", "true", evaluate(scenario, "(() => {const n=document.querySelector(" + JSONObject.quote(selector) + ");if(!n||n.disabled)return false;n.click();return true;})()"));
    }
    private static void login(ActivityScenario<MainActivity> scenario, JSONObject credentials) throws Exception {
        navigate(scenario, "/?cal=CAL-01&tab=account&view=login&shell=native");
        waitFor(scenario, "!!document.querySelector('input[name=identifier]')", "normal login form missing");
        String script = "(() => {const set=(name,value)=>{const n=document.querySelector('input[name='+name+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}));};set('identifier'," + JSONObject.quote(credentials.getString("email")) + ");set('password'," + JSONObject.quote(credentials.getString("password")) + ");document.querySelector('input[name=identifier]').closest('form').requestSubmit();return true;})()";
        evaluate(scenario, script);
        waitFor(scenario, "!document.querySelector('input[name=identifier]')", "normal customer login did not complete");
    }
    private static JSONObject loginFixture() throws Exception {
        // The runner copies synthetic credentials into this isolated UAT
        // app's private directory via adb run-as; never into browser storage,
        // command arguments, test output or a public fixture endpoint.
        File fixture = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(), "b03-login.json");
        try (FileInputStream stream = new FileInputStream(fixture)) {
            return new JSONObject(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
        }
    }
    private static JSONObject api(String method, JSONObject body, String token, String version) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL("http://127.0.0.1:5000/api/shared-state/cart").openConnection();
        connection.setConnectTimeout(5000); connection.setReadTimeout(5000); connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod(method); connection.setRequestProperty("Authorization", "Bearer " + token);
        if (version != null) { connection.setRequestProperty("X-Cart-Schema-Version", version); connection.setRequestProperty("X-Cart-Variant-Line-Identity", "true"); connection.setRequestProperty("X-Cart-CAS", "true"); }
        if (body != null) { connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json"); connection.getOutputStream().write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int status = connection.getResponseCode(); ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream()) { if (input != null) { byte[] buffer = new byte[4096]; int count; while ((count = input.read(buffer)) >= 0) bytes.write(buffer, 0, count); } }
        connection.disconnect();
        return new JSONObject().put("status", status).put("payload", new JSONObject(bytes.toString(StandardCharsets.UTF_8.name())));
    }
    private static void evidence(ActivityScenario<MainActivity> scenario, String name) throws Exception {
        waitFor(scenario, "[...document.querySelectorAll('.cart-item img')].every(n=>n.complete&&n.naturalWidth>0)", "canonical cart media did not load");
        File directory = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "b03");
        assertTrue(directory.isDirectory() || directory.mkdirs());
        String result = evaluate(scenario, "JSON.stringify({revision:document.querySelector('.cart-layout')?.dataset.cartRevision,rows:[...document.querySelectorAll('.cart-item')].map(n=>({productId:n.dataset.productId,variantId:n.dataset.variantId,quantity:Number(n.querySelector('.quantity b')?.innerText),text:n.innerText})),browserCredentialsPresent:Boolean(localStorage.getItem('nova_user_token')||localStorage.getItem('novastore.customer.session.v1'))})");
        String json = new JSONArray("[" + result + "]").getString(0);
        assertFalse("Native credentials must not be in browser storage", new JSONObject(json).getBoolean("browserCredentialsPresent"));
        try (FileOutputStream file = new FileOutputStream(new File(directory, name + ".json"))) { file.write(json.getBytes(StandardCharsets.UTF_8)); }
        SystemClock.sleep(500);
        Bitmap screenshot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull(screenshot);
        try (FileOutputStream file = new FileOutputStream(new File(directory, name + ".png"))) { assertTrue(screenshot.compress(Bitmap.CompressFormat.PNG, 100, file)); }
        screenshot.recycle();
    }
    private static void waitFor(ActivityScenario<MainActivity> scenario, String script, String message) throws Exception {
        long end = SystemClock.elapsedRealtime() + 30000;
        String state;
        do { state = evaluate(scenario, script); if ("true".equals(state)) return; SystemClock.sleep(100); } while (SystemClock.elapsedRealtime() < end);
        assertEquals(message, "true", state);
    }
    private static String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        AtomicReference<String> value = new AtomicReference<>(); CountDownLatch latch = new CountDownLatch(1);
        scenario.onActivity(activity -> evaluateReady(activity.getBridge().getWebView(), script, value, latch));
        assertTrue("Native WebView response timed out", latch.await(30, TimeUnit.SECONDS));
        return value.get();
    }
    private static void evaluateReady(WebView webView, String script, AtomicReference<String> value, CountDownLatch latch) {
        webView.evaluateJavascript("document.readyState==='complete'&&!!document.querySelector('[data-testid=calibration-app]')", ready -> {
            if ("true".equals(ready)) webView.evaluateJavascript(script, result -> { value.set(result); latch.countDown(); });
            else webView.postDelayed(() -> evaluateReady(webView, script, value, latch), 100);
        });
    }
}
