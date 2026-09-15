package com.novastore.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.PluginHandle;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class R25CanonicalVariantInstrumentedTest {
    private static final long WEB_TIMEOUT_SECONDS = 30L;
    private static final String CART_KEY = "novastore.customer.cart.v1";
    private static final String SELECTION_KEY = "novastore.customer.variant-selection.v1";
    private Context context;

    @Before
    public void resetFixtureAndSecureSession() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.deleteSharedPreferences(NovaCustomerSessionPlugin.PREFERENCES);
        fixture("POST", "/__fixture/reset", new JSONObject());
    }

    @After
    public void clearSecureSession() {
        context.deleteSharedPreferences(NovaCustomerSessionPlugin.PREFERENCES);
    }

    @Test
    public void canonicalPdpUsesWholeServerRowsAndExactPriceStock() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            try {
                clearBrowserCommerce(scenario);
                openProduct(scenario, 202);
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=canonical-variant-selector]'))", "canonical selector did not render");

                JSONObject before = evaluateJson(scenario,
                    "(() => {const rows=[...document.querySelectorAll('[role=radio][data-testid^=canonical-variant-]')];" +
                        "const out=document.querySelector('[data-testid=canonical-variant-2002]');" +
                        "const add=document.querySelector('.pdp-add-to-cart');return {" +
                        "product:document.querySelector('[data-testid=product-detail-screen]')?.dataset.productId||''," +
                        "rows:rows.length,radios:rows.filter(row=>row.getAttribute('role')==='radio').length," +
                        "checked:rows.filter(row=>row.getAttribute('aria-checked')==='true').length," +
                        "oosDisabled:Boolean(out?.disabled),oosText:out?.innerText||'',addDisabled:Boolean(add?.disabled)," +
                        "status:document.querySelector('[data-testid=canonical-variant-selector] p[role=status]')?.innerText||''};})()"
                );
                assertEquals("202", before.getString("product"));
                assertEquals(3, before.getInt("rows"));
                assertEquals(3, before.getInt("radios"));
                assertEquals(0, before.getInt("checked"));
                assertTrue(before.getBoolean("oosDisabled"));
                assertTrue(before.getString("oosText").contains("Stokta yok"));
                assertTrue(before.getBoolean("addDisabled"));
                assertTrue(before.getString("status").contains("seçenek belirle"));

                click(scenario, "[data-testid=canonical-variant-2001]");
                JSONObject selected = evaluateJson(scenario,
                    "(() => {const row=document.querySelector('[data-testid=canonical-variant-2001]');" +
                        "const plus=document.querySelector('[aria-label=\"Adedi artır\"]');return {" +
                        "checked:row?.getAttribute('aria-checked')||'',label:row?.innerText||''," +
                        "cue:Boolean(row?.querySelector('[aria-label=Seçildi]')),price:document.querySelector('.price.large strong')?.innerText||''," +
                        "stock:document.querySelector('.pdp-stock strong')?.innerText||'',addDisabled:Boolean(document.querySelector('.pdp-add-to-cart')?.disabled)," +
                        "qty:Number(document.querySelector('.pdp-footer .quantity b')?.innerText||0),plusDisabled:Boolean(plus?.disabled)};})()"
                );
                assertEquals("true", selected.getString("checked"));
                assertTrue(selected.getString("label").contains("Renk: Siyah"));
                assertTrue(selected.getString("label").contains("Kapasite: 128 GB"));
                assertTrue(selected.getString("label").contains("3.499"));
                assertTrue(selected.getBoolean("cue"));
                assertTrue(selected.getString("price").contains("3.499"));
                assertTrue(selected.getString("stock").contains("3 ürün"));
                assertFalse(selected.getBoolean("addDisabled"));

                click(scenario, "[aria-label=\"Adedi artır\"]");
                click(scenario, "[aria-label=\"Adedi artır\"]");
                JSONObject capped = evaluateJson(scenario,
                    "(() => ({qty:Number(document.querySelector('.pdp-footer .quantity b')?.innerText||0)," +
                        "disabled:Boolean(document.querySelector('[aria-label=\"Adedi artır\"]')?.disabled)}))()"
                );
                assertEquals(3, capped.getInt("qty"));
                assertTrue(capped.getBoolean("disabled"));
            } finally {
                clearBrowserCommerce(scenario);
            }
        }
    }

    @Test
    public void cartAggregatesSameVariantKeepsSiblingSeparateAndSurvivesRecreation() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            try {
                clearBrowserCommerce(scenario);
                openProduct(scenario, 202);
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=canonical-variant-2001]'))", "variant PDP did not load");
                click(scenario, "[data-testid=canonical-variant-2001]");
                addAndWait(scenario, "first");
                addAndWait(scenario, "second");
                click(scenario, "[data-testid=canonical-variant-2003]");
                addAndWait(scenario, "sibling");

                navigate(scenario, "/?cal=CAL-07&tab=cart&shell=native");
                JSONObject cart = cartState(scenario);
                assertEquals(2, cart.getInt("rows"));
                assertEquals(2, cart.getInt("blackQuantity"));
                assertEquals(1, cart.getInt("whiteQuantity"));
                assertTrue(cart.getString("blackText").contains("Renk: Siyah"));
                assertTrue(cart.getString("whiteText").contains("Renk: Beyaz"));
                assertEquals("2001", cart.getString("blackVariant"));
                assertEquals("2003", cart.getString("whiteVariant"));

                scenario.recreate();
                navigate(scenario, "/?cal=CAL-07&tab=cart&shell=native");
                JSONObject restored = cartState(scenario);
                assertEquals(2, restored.getInt("rows"));
                assertEquals(2, restored.getInt("blackQuantity"));
                assertEquals(1, restored.getInt("whiteQuantity"));

                openProduct(scenario, 202);
                waitForTrue(scenario, "document.querySelector('[data-testid=canonical-variant-2003]')?.getAttribute('aria-checked')==='true'", "variant selection did not survive recreation");
            } finally {
                clearBrowserCommerce(scenario);
            }
        }
    }

    @Test
    public void removedDeletedDisabledAndStockLostVariantsCannotEnterCart() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            try {
                clearBrowserCommerce(scenario);
                openProduct(scenario, 202);
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=canonical-variant-2001]'))", "variant PDP did not load");
                click(scenario, "[data-testid=canonical-variant-2001]");

                fixture("POST", "/__fixture/mode", new JSONObject().put("productMode", "removed"));
                click(scenario, ".pdp-add-to-cart");
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=pdp-purchase-error]'))", "removed variant was not rejected");
                assertEquals("0", evaluate(scenario, "JSON.parse(localStorage.getItem('" + CART_KEY + "')||'{\"lines\":[]}').lines.length"));

                fixture("POST", "/__fixture/mode", new JSONObject().put("productMode", "deleted"));
                reloadProduct(scenario);
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=canonical-variant-selector]'))", "deleted variant response did not render");
                assertEquals("0", evaluate(scenario, "document.querySelectorAll('[data-testid=canonical-variant-2001]').length"));

                fixture("POST", "/__fixture/mode", new JSONObject().put("productMode", "disabled"));
                reloadProduct(scenario);
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=canonical-variant-2001]'))", "disabled variant response did not render");
                assertEquals("true", evaluate(scenario, "document.querySelector('[data-testid=canonical-variant-2001]').disabled"));

                fixture("POST", "/__fixture/mode", new JSONObject().put("productMode", "normal"));
                reloadProduct(scenario);
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=canonical-variant-2001]'))", "normal variant response did not return");
                click(scenario, "[data-testid=canonical-variant-2001]");
                fixture("POST", "/__fixture/mode", new JSONObject().put("productMode", "stock-lost"));
                click(scenario, ".pdp-add-to-cart");
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=pdp-purchase-error]'))", "stock-lost variant was not rejected");
                assertEquals("0", evaluate(scenario, "JSON.parse(localStorage.getItem('" + CART_KEY + "')||'{\"lines\":[]}').lines.length"));
            } finally {
                clearBrowserCommerce(scenario);
            }
        }
    }

    @Test
    public void stalePriceClearsLegalConsentAndSendsOnlyCanonicalIdentity() throws Exception {
        runStaleCheckout("stale-price", "VARIANT_PRICE_CHANGED", true);
    }

    @Test
    public void staleStockClearsLegalConsentAndNeverReportsPaymentSuccess() throws Exception {
        runStaleCheckout("stale-stock", "VARIANT_STOCK_UNAVAILABLE", false);
    }

    @Test
    public void simpleProductAndHistoricalVariantOrderKeepTheirOwnTruth() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            try {
                clearBrowserCommerce(scenario);
                openProduct(scenario, 101);
                waitForTrue(scenario, "document.querySelector('[data-testid=product-detail-screen]')?.dataset.productId==='101'", "simple PDP did not load");
                assertEquals("0", evaluate(scenario, "document.querySelectorAll('[data-testid=canonical-variant-selector]').length"));
                click(scenario, ".pdp-add-to-cart");
                waitForTrue(scenario, "Boolean(localStorage.getItem('" + CART_KEY + "'))", "simple cart line was not saved");
                navigate(scenario, "/?cal=CAL-07&tab=cart&shell=native");
                assertEquals("1", evaluate(scenario, "document.querySelectorAll('[data-testid=cart-item-product-101]').length"));
                assertEquals("true", evaluate(scenario, "document.querySelector('[data-testid=cart-item-product-101]')?.dataset.variantId===undefined"));

                installAuthenticatedSession(scenario);
                scenario.recreate();
                navigate(scenario, "/?cal=CAL-09&tab=account&shell=native");
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=real-order-list]'))", "real order list did not load");
                clickByText(scenario, ".orders-link", "Sipariş #501");
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=real-order-detail]'))", "historical order detail did not open");
                JSONObject order = evaluateJson(scenario,
                    "(() => {const snapshot=document.querySelector('[data-testid=order-variant-snapshot]');const root=document.querySelector('[data-testid=real-order-detail]');return {" +
                        "order:root?.dataset.orderId||'',variant:snapshot?.dataset.variantId||'',text:snapshot?.innerText||''," +
                        "product:Boolean([...root.querySelectorAll('button')].find(button=>button.innerText.includes('Ürüne Git')))," +
                        "returns:Boolean([...root.querySelectorAll('button')].find(button=>button.innerText.includes('İade Talebi Oluştur')))};})()"
                );
                assertEquals("501", order.getString("order"));
                assertEquals("2001", order.getString("variant"));
                assertTrue(order.getString("text").contains("Gece Siyahı"));
                assertTrue(order.getString("text").contains("128 GB Tarihsel"));
                assertTrue(order.getString("text").contains("PHONE-BLK-128-HIST"));
                assertTrue(order.getBoolean("product"));
                assertTrue(order.getBoolean("returns"));
                clickByText(scenario, "[data-testid=real-order-detail] button", "İade Talebi Oluştur");
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=returns-view]'))", "eligible historical order did not reach return creation");
                assertTrue(evaluate(scenario, "document.querySelector('[data-testid=returns-view]')?.innerText||''").contains("Sipariş #501"));
                clickByText(scenario, "[data-testid=returns-view] button", "İade Talebi Oluştur");
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=return-created-success]'))", "variant order return was not created");
                assertTrue(evaluate(scenario, "document.querySelector('[data-testid=return-created-success]')?.innerText||''").contains("Talebiniz oluşturuldu"));

                clickByText(scenario, "[data-testid=return-created-success] button", "İade Talebini Gör");
                waitForTrue(scenario, "document.querySelector('[data-testid=return-detail]')?.dataset.returnId==='901'", "created return detail did not load by exact id");
                JSONObject created = returnDetailState(scenario);
                assertEquals("901", created.getString("id"));
                assertTrue(created.getString("text").contains("#501"));
                assertTrue(created.getString("text").contains("Talep alındı"));
                assertEquals("NONE", created.getString("refundStatus"));
                assertFalse(created.getBoolean("refundComplete"));

                clickByText(scenario, "[data-testid=return-detail] button", "Tüm İade Taleplerim");
                waitForTrue(scenario, "document.querySelector('[data-testid=return-history]')?.dataset.historyState==='ready'", "return history did not refresh after create");
                JSONObject history = evaluateJson(scenario,
                    "(() => {const rows=[...document.querySelectorAll('.return-history-list .return-order')];return {" +
                        "count:rows.length,created:Boolean(rows.find(row=>row.innerText.includes('İade #901')))," +
                        "rejected:Boolean(rows.find(row=>row.innerText.includes('İade #801')&&row.dataset.returnStatus==='REJECTED'))};})()"
                );
                assertEquals(2, history.getInt("count"));
                assertTrue(history.getBoolean("created"));
                assertTrue(history.getBoolean("rejected"));
                clickByText(scenario, ".return-history-list .return-order", "İade #801");
                waitForTrue(scenario, "document.querySelector('[data-testid=return-detail]')?.dataset.returnId==='801'", "rejected return detail did not load");
                JSONObject rejected = returnDetailState(scenario);
                assertEquals("801", rejected.getString("id"));
                assertTrue(rejected.getString("text").contains("İade talebi reddedildi"));
                assertTrue(rejected.getString("text").contains("İade uygunluk süresi sona ermiş"));
                assertEquals("NONE", rejected.getString("refundStatus"));
                assertFalse(rejected.getBoolean("refundComplete"));

                navigate(scenario, "/?cal=CAL-10&tab=account&view=notifications&shell=native");
                waitForTrue(scenario, "document.querySelector('[data-testid=notification-center-screen]')?.dataset.feedState==='ready'", "return notifications did not load");
                clickByText(scenario, ".notification-list button", "İade talebi sonuçlandı");
                waitForTrue(scenario, "document.querySelector('[data-testid=return-detail]')?.dataset.returnId==='801'", "notification did not authorize exact rejected return target");

                scenario.onActivity(activity -> {
                    Intent deepLink = new Intent(Intent.ACTION_VIEW, Uri.parse(
                        "novastore://customer?cal=CAL-10&tab=account&view=returns&returnId=801"
                    ));
                    deepLink.setClass(activity, MainActivity.class);
                    activity.startActivity(deepLink);
                });
                waitForTrue(scenario, "document.querySelector('[data-testid=return-detail]')?.dataset.returnId==='801' && location.search.includes('returnId=801')", "warm native deep link did not retain exact return id");
            } finally {
                clearBrowserCommerce(scenario);
            }
        }
    }

    private void runStaleCheckout(String mode, String expectedCode, boolean expectReprice) throws Exception {
        fixture("POST", "/__fixture/mode", new JSONObject().put("initializeMode", mode));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            try {
                clearBrowserCommerce(scenario);
                seedVariantCart(scenario);
                installAuthenticatedSession(scenario);
                scenario.recreate();
                navigate(scenario, "/?cal=CAL-08&tab=cart&shell=native");
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=native-authoritative-checkout]') && document.querySelector('[data-testid=checkout-legal-checkbox-distance-sale]'))", "authoritative checkout did not load");
                click(scenario, "[data-testid=checkout-legal-checkbox-pre-information]");
                click(scenario, "[data-testid=checkout-legal-checkbox-distance-sale]");
                waitForTrue(scenario, "[...document.querySelectorAll('[data-testid^=checkout-legal-checkbox-]')].every(input=>input.checked)", "legal consent did not become accepted");
                clickByText(scenario, ".checkout-summary > button", "PayTR’a Geç");
                waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=checkout-variant-conflict]'))", "stale checkout did not render canonical conflict");

                JSONObject blocked = evaluateJson(scenario,
                    "(() => ({unchecked:[...document.querySelectorAll('[data-testid^=checkout-legal-checkbox-]')].every(input=>!input.checked)," +
                        "success:document.body.innerText.includes('Ödemen doğrulandı'),cart:JSON.parse(localStorage.getItem('" + CART_KEY + "')||'{\"lines\":[]}').lines.length," +
                        "total:document.querySelector('.checkout-summary .total b')?.innerText||''}))()"
                );
                assertTrue(blocked.getBoolean("unchecked"));
                assertFalse(blocked.getBoolean("success"));
                assertEquals(1, blocked.getInt("cart"));
                if (expectReprice) {
                    waitForTrue(scenario, "document.querySelector('.checkout-summary .total b')?.innerText.includes('3.799')", "refreshed stale price did not render");
                }

                JSONArray requests = fixture("GET", "/__fixture/evidence", null).getJSONArray("requests");
                JSONObject initialize = null;
                for (int index = 0; index < requests.length(); index++) {
                    JSONObject request = requests.getJSONObject(index);
                    if ("/api/payments/initialize".equals(request.getString("path"))) initialize = request;
                }
                assertNotNull(initialize);
                JSONObject body = initialize.getJSONObject("body");
                JSONArray items = body.getJSONArray("cartItems");
                assertEquals(1, items.length());
                assertEquals(409, initialize.getInt("responseStatus"));
                assertEquals(expectedCode, initialize.getString("responseCode"));
                JSONObject item = items.getJSONObject(0);
                assertEquals(3, item.length());
                assertEquals(202, item.getInt("product_id"));
                assertEquals(2001, item.getInt("variant_id"));
                assertEquals(1, item.getInt("quantity"));
                assertFalse(item.has("price"));
                assertFalse(item.has("stock"));
                JSONArray acceptances = body.getJSONArray("agreementAcceptances");
                assertEquals(2, acceptances.length());
                assertTrue(acceptances.getJSONObject(0).getBoolean("accepted"));
                assertTrue(acceptances.getJSONObject(1).getBoolean("accepted"));
            } finally {
                clearBrowserCommerce(scenario);
            }
        }
    }

    private static JSONObject cartState(ActivityScenario<MainActivity> scenario) throws Exception {
        return evaluateJson(scenario,
            "(() => {const black=document.querySelector('[data-testid=cart-item-product-202-variant-2001]');" +
                "const white=document.querySelector('[data-testid=cart-item-product-202-variant-2003]');return {" +
                "rows:document.querySelectorAll('[data-testid^=cart-item-product-202-variant-]').length," +
                "blackQuantity:Number(black?.querySelector('.quantity b')?.innerText||0),whiteQuantity:Number(white?.querySelector('.quantity b')?.innerText||0)," +
                "blackText:black?.innerText||'',whiteText:white?.innerText||'',blackVariant:black?.dataset.variantId||'',whiteVariant:white?.dataset.variantId||''};})()"
        );
    }

    private static JSONObject returnDetailState(ActivityScenario<MainActivity> scenario) throws Exception {
        return evaluateJson(scenario,
            "(() => {const root=document.querySelector('[data-testid=return-detail]');const refund=document.querySelector('[data-testid=return-refund-truth]');return {" +
                "id:root?.dataset.returnId||'',text:root?.innerText||'',refundStatus:refund?.dataset.refundStatus||'',refundComplete:refund?.dataset.refundComplete==='true'};})()"
        );
    }

    private static void addAndWait(ActivityScenario<MainActivity> scenario, String label) throws Exception {
        click(scenario, ".pdp-add-to-cart");
        waitForTrue(scenario, "document.querySelector('.pdp-add-to-cart')?.getAttribute('aria-pressed')==='true'", label + " add did not complete");
        waitForTrue(scenario, "document.querySelector('.pdp-add-to-cart')?.getAttribute('aria-pressed')==='false'", label + " add feedback did not settle");
    }

    private static void openProduct(ActivityScenario<MainActivity> scenario, int productId) throws Exception {
        navigate(scenario, "/?cal=CAL-06&tab=home&productId=" + productId + "&shell=native");
        waitForTrue(scenario, "Boolean(document.querySelector('[data-testid=product-detail-screen],[data-testid=public-product-error]'))", "product route did not settle");
    }

    private static void reloadProduct(ActivityScenario<MainActivity> scenario) throws Exception {
        navigate(scenario, "/?cal=CAL-06&tab=home&productId=101&shell=native");
        waitForTrue(scenario, "document.querySelector('[data-testid=product-detail-screen]')?.dataset.productId==='101'", "simple interstitial PDP did not load");
        openProduct(scenario, 202);
    }

    private static void navigate(ActivityScenario<MainActivity> scenario, String location) throws Exception {
        evaluate(scenario, "history.replaceState({novastoreDepth:0},''," + JSONObject.quote(location) + ");dispatchEvent(new PopStateEvent('popstate'));true");
    }

    private static void click(ActivityScenario<MainActivity> scenario, String selector) throws Exception {
        String result = evaluate(scenario, "(() => {const node=document.querySelector(" + JSONObject.quote(selector) + ");if(!node)return false;node.click();return true})()");
        assertEquals("Missing clickable selector: " + selector, "true", result);
    }

    private static void clickByText(ActivityScenario<MainActivity> scenario, String selector, String text) throws Exception {
        String script = "(() => {const node=[...document.querySelectorAll(" + JSONObject.quote(selector) + ")].find(item=>(item.innerText||'').includes(" + JSONObject.quote(text) + "));if(!node)return false;node.click();return true})()";
        assertEquals("Missing clickable text: " + text, "true", evaluate(scenario, script));
    }

    private static void clearBrowserCommerce(ActivityScenario<MainActivity> scenario) throws Exception {
        evaluate(scenario, "localStorage.removeItem('" + CART_KEY + "');localStorage.removeItem('" + SELECTION_KEY + "');true");
    }

    private static void seedVariantCart(ActivityScenario<MainActivity> scenario) throws Exception {
        JSONObject snapshot = new JSONObject()
            .put("id", "202").put("name", "Kanonik Telefon").put("store", "R25 Kanonik Mağaza")
            .put("image", "/calibration-assets/generated/nova-pulse-anc-ivory-v1.png")
            .put("price", "₺3.499,00").put("amount", 3499).put("stock", 3).put("isPublicProjection", true);
        JSONArray selections = new JSONArray()
            .put(new JSONObject().put("group", "Renk").put("value", "Siyah"))
            .put(new JSONObject().put("group", "Kapasite").put("value", "128 GB"));
        JSONObject line = new JSONObject().put("id", "product-202-variant-2001").put("productId", "202")
            .put("variantId", 2001).put("variantSelections", selections).put("quantity", 1).put("snapshot", snapshot);
        JSONObject cart = new JSONObject().put("version", 1).put("lines", new JSONArray().put(line));
        evaluate(scenario, "localStorage.setItem('" + CART_KEY + "'," + JSONObject.quote(cart.toString()) + ");true");
    }

    private static void installAuthenticatedSession(ActivityScenario<MainActivity> scenario) throws Exception {
        NovaCustomerSessionPlugin plugin = sessionPlugin(scenario);
        JSONObject current = plugin.loadStoredEnvelope();
        if (!current.isNull("session")) current = plugin.clearStoredEnvelope(current.getLong("generation"));
        JSONObject session = new JSONObject()
            .put("accessToken", "access-token-r25-0123456789")
            .put("refreshToken", "refresh-token-r25-0123456789")
            .put("accessExpiresAt", "2099-01-01T00:00:00.000Z")
            .put("refreshExpiresAt", "2099-02-01T00:00:00.000Z")
            .put("sessionId", 251L);
        plugin.replaceStoredEnvelope(current.getLong("generation"), session);
    }

    private static NovaCustomerSessionPlugin sessionPlugin(ActivityScenario<MainActivity> scenario) {
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

    private static JSONObject fixture(String method, String path, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL("http://127.0.0.1:5000" + path).openConnection();
        connection.setConnectTimeout(5_000);
        connection.setReadTimeout(5_000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod(method);
        if (body != null) {
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(bytes.length);
            connection.setRequestProperty("content-type", "application/json");
            try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
        }
        int status = connection.getResponseCode();
        InputStream source = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        if (source != null) {
            try (InputStream input = source) {
                byte[] buffer = new byte[4096];
                int count;
                while ((count = input.read(buffer)) >= 0) bytes.write(buffer, 0, count);
            }
        }
        connection.disconnect();
        assertEquals("Fixture HTTP response: " + bytes.toString(StandardCharsets.UTF_8.name()), 200, status);
        return new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
    }

    private static void waitForTrue(ActivityScenario<MainActivity> scenario, String script, String message) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + TimeUnit.SECONDS.toMillis(WEB_TIMEOUT_SECONDS);
        String state;
        do {
            state = evaluate(scenario, script);
            if ("true".equals(state)) return;
            Thread.sleep(100L);
        } while (SystemClock.elapsedRealtime() < deadline);
        assertEquals(message, "true", state);
    }

    private static JSONObject evaluateJson(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        String encoded = evaluate(scenario, "(() => {const value=" + script + ";return JSON.stringify(value)})()");
        String json = new JSONArray("[" + encoded + "]").getString(0);
        return new JSONObject(json);
    }

    private static String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        scenario.onActivity(activity -> waitForDocument(activity.getBridge().getWebView(), script, value, latch));
        assertTrue("WebView JavaScript result timed out", latch.await(WEB_TIMEOUT_SECONDS, TimeUnit.SECONDS));
        return value.get();
    }

    private static void waitForDocument(WebView webView, String script, AtomicReference<String> value, CountDownLatch latch) {
        webView.evaluateJavascript("document.readyState==='complete' && !!document.querySelector('[data-testid=calibration-app]')", ready -> {
            if ("true".equals(ready)) {
                webView.evaluateJavascript(script, result -> { value.set(result); latch.countDown(); });
            } else {
                webView.postDelayed(() -> waitForDocument(webView, script, value, latch), 100L);
            }
        });
    }
}
