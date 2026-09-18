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
import java.io.File;
import java.io.FileOutputStream;
import android.graphics.Bitmap;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;


@RunWith(AndroidJUnit4.class)
public final class R26MarketplaceInstrumentedTest {
    private static final long WEB_TIMEOUT_SECONDS = 30L;
    private Context context;
    private JSONObject data;
    @Before public void setup() throws Exception {
        context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.deleteSharedPreferences(NovaCustomerSessionPlugin.PREFERENCES);
        data=fixture("GET","/__r26/fixture",null);
    }
    @After public void clearSession() { context.deleteSharedPreferences(NovaCustomerSessionPlugin.PREFERENCES); }
    private static final String CARDS="[data-testid=marketplace-discovery] .product-card";
    private static String count(String selector,int number){return "document.querySelectorAll("+JSONObject.quote(selector)+").length==="+number;}
    private static void screenshot(String name) throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        // DOM evaluation returns before WebView paints a programmatic scroll.
        android.os.SystemClock.sleep(250);
        Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull(image);
        try(FileOutputStream out=new FileOutputStream(new File(context.getExternalFilesDir(null),"r26-"+name+".png"))){assertTrue(image.compress(Bitmap.CompressFormat.PNG,100,out));}
    }
    @Test public void marketplacePositions21And101AndRefreshUseRealR27() throws Exception {
        try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){
            navigate(s,"/?cal=CAL-02&tab=home");waitForTrue(s,count(CARDS,20),"first page");
            screenshot("home");
            for(int expected:new int[]{40,60,80,100,108}){
                clickByText(s,".public-page-controls button","Daha fazla göster");waitForTrue(s,count(CARDS,expected),"continuation "+expected);
            }
            assertEquals("108",evaluate(s,"new Set([...document.querySelectorAll('"+CARDS+"')].map(n=>n.dataset.productId)).size"));
            assertEquals("true",evaluate(s,"Boolean(document.querySelectorAll('"+CARDS+"')[100]?.dataset.productId)"));
            click(s,"[aria-label='Ürünleri yenile']");waitForTrue(s,count(CARDS,20),"refresh reset");
            scenarioReopen(s);
            waitForTrue(s,count(CARDS,20),"recreation marketplace");
            assertEquals("true",evaluate(s,"document.querySelector('[data-testid=marketplace-discovery]').innerText.includes('R25 Foreign Store') && document.querySelector('[data-testid=marketplace-discovery]').innerText.includes('R25 Canonical Store')"));
        }
    }
    private static void scenarioReopen(ActivityScenario<MainActivity> s) { s.recreate(); }
    @Test public void nativeServerSearchContinuesAndCanonicalNestedCategoriesRefresh() throws Exception {
        try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){
            navigate(s,"/?cal=CAL-02&tab=home&view=search");
            fill(s,"[aria-label='Ürün ara']","R26 Ortak");
            waitForTrue(s,count(CARDS,20),"search page");
            for(int expected:new int[]{40,60,80,100,105}){clickByText(s,".public-page-controls button","Daha fazla göster");waitForTrue(s,count(CARDS,expected),"search continuation");}
            screenshot("search");
            navigate(s,"/?cal=CAL-03&tab=categories");waitForTrue(s,"Boolean(document.querySelector('[data-testid=public-category-tree] [role=tab]'))","category tree");
            clickByText(s,".category-rail button","R26 Teknoloji");
            waitForTrue(s,"Boolean(document.querySelector('[data-category-id=\""+data.getInt("nestedCategory")+"\"]'))","nested category");
            screenshot("categories");
            click(s,"[data-category-id='"+data.getInt("childCategory")+"']");waitForTrue(s,count(CARDS,20),"category list");
            clickByText(s,".public-page-controls button","Daha fazla göster");waitForTrue(s,count(CARDS,40),"category continuation");
            navigate(s,"/?cal=CAL-03&tab=categories");waitForTrue(s,"Boolean(document.querySelector('.category-rail button'))","tree again");
            clickByText(s,".category-rail button","R26 Teknoloji");fixture("POST","/__r26/rename-category",new JSONObject());
            click(s,"[aria-label='Kategorileri yenile']");waitForTrue(s,"document.querySelector('[data-testid=public-category-tree]')?.innerText.includes('R26 Alt Güncellendi')","live category refresh");
        }
    }
    @Test public void publicReputationPageTwoUsesMaskedPlainTextAndServerGlobalSummary() throws Exception {
        try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){
            navigate(s,"/?cal=CAL-06&tab=home&productId="+data.getInt("reputationProductId"));
            waitForTrue(s,count("[data-testid=public-questions] .question-thread",20),"questions page");
            waitForTrue(s,count("[data-testid=public-reviews] .review-preview",20),"reviews page");
            assertEquals("20",evaluate(s,"document.querySelectorAll('[data-testid=public-reviews] time').length"));
            evaluate(s,"document.querySelector('[data-testid=public-reviews]').scrollIntoView();true");
            waitForTrue(s,"(()=>{const image=document.querySelector('[data-testid=public-reviews] img');return Boolean(image?.complete && image?.naturalWidth>0)})()","safe public review media");
            String summary=evaluate(s,"document.querySelector('[data-testid=public-review-summary]').innerText");
            assertTrue(summary.contains("27"));
            clickByText(s,"[data-testid=public-questions] button","Daha fazla soru");
            waitForTrue(s,count("[data-testid=public-questions] .question-thread",27),"questions page two");
            clickByText(s,"[data-testid=public-reviews] button","Daha fazla değerlendirme");
            waitForTrue(s,count("[data-testid=public-reviews] .review-preview",27),"reviews page two");
            assertEquals(summary,evaluate(s,"document.querySelector('[data-testid=public-review-summary]').innerText"));
            assertEquals("0",evaluate(s,"document.querySelectorAll('[data-testid=public-questions] script,[data-testid=public-questions] img,[data-testid=public-reviews] script').length"));
            assertEquals("true",evaluate(s,"typeof window.__r26Injected==='undefined'"));
            String text=evaluate(s,"document.querySelector('[data-testid=public-questions]').innerText+document.querySelector('[data-testid=public-reviews]').innerText");
            for(String hidden:new String[]{"PRIVATE","example.test","05555555555","Özel Müşteri","user_id","answered_by","organization_id"})assertFalse(hidden,text.contains(hidden));
            evaluate(s,"document.querySelector('[data-testid=public-reviews]').scrollIntoView();true");screenshot("reviews");
            evaluate(s,"document.querySelector('[data-testid=public-questions]').scrollIntoView();true");screenshot("questions");
        }
    }
    @Test public void coldStoreBDeepLinkAndStoreContinuationKeepExactIdentity() throws Exception {
        int id=data.getJSONArray("marketplaceIds").getInt(0);
        Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse("novastore://customer?cal=CAL-06&tab=home&productId="+id),context,MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try(ActivityScenario<MainActivity> s=ActivityScenario.launch(intent)){
            waitForTrue(s,"document.querySelector('[data-testid=product-detail-screen]')?.dataset.productId==='"+id+"'","cold exact product");
            assertTrue(evaluate(s,"document.querySelector('.pdp-seller-identity').innerText").contains("R25 Foreign Store"));
            screenshot("cold-store-b-product");clickByText(s,".pdp-seller-actions button","Mağazaya Git");
            waitForTrue(s,count(".store-products-grid .product-card",20),"store first page");
            clickByText(s,".public-page-controls button","Daha fazla mağaza");waitForTrue(s,count(".store-products-grid .product-card",40),"store continuation");
            clickByText(s,".public-page-controls button","Daha fazla mağaza");waitForTrue(s,count(".store-products-grid .product-card",54),"store completion");
            assertEquals("true",evaluate(s,"[...document.querySelectorAll('.store-products-grid .product-card')].every(n=>n.innerText.includes('R25 Foreign Store'))"));
            evaluate(s,"document.querySelector('.store-profile-row').scrollIntoView();true");screenshot("store");
        }
    }
    @Test public void nativeLoginFavoriteBeyondFirstPageAndCanonicalVariantsSurviveRecreation() throws Exception {
        try(ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class)){
            navigate(s,"/?cal=CAL-01&tab=account&view=login");
            fill(s,"input[name=identifier]","r25-real@example.test");fill(s,"input[name=password]","R26LocalOnly!2026");
            evaluate(s,"document.querySelector('.login-layout').requestSubmit();true");
            waitForTrue(s,"!document.querySelector('.login-layout')","real customer login");
            int id=data.getJSONArray("marketplaceIds").getInt(0);
            navigate(s,"/?cal=CAL-06&tab=home&productId="+id);
            waitForTrue(s,"document.querySelector('[data-testid=product-detail-screen]')?.dataset.productId==='"+id+"'","favorite product");
            evaluate(s,"document.querySelector('[aria-label=\"Favoriye ekle\"]')?.click();true");
            navigate(s,"/?cal=CAL-04&tab=favorites");
            waitForTrue(s,"Boolean(document.querySelector('[data-testid=public-favorites] [data-product-id=\""+id+"\"]'))","favorite outside first page");
            s.recreate();navigate(s,"/?cal=CAL-04&tab=favorites");waitForTrue(s,"Boolean(document.querySelector('[data-testid=public-favorites] [data-product-id=\""+id+"\"]'))","favorite restored");screenshot("favorites");
            navigate(s,"/?cal=CAL-02&tab=home");waitForTrue(s,count(CARDS,20),"variant discovered in marketplace");
            clickByText(s,"[data-testid=marketplace-discovery] [data-product-id='"+data.getInt("variantProductId")+"'] button","R25 Kanonik Varyantlı Ürün");
            waitForTrue(s,"Boolean(document.querySelector('[data-testid=canonical-variant-selector]'))","R25 variant selector");
            assertEquals("true",evaluate(s,"document.querySelector('.pdp-add-to-cart').disabled"));
            click(s,"[data-testid=canonical-variant-"+data.getInt("variantM")+"]");
            assertEquals("false",evaluate(s,"document.querySelector('.pdp-add-to-cart').disabled"));
            assertTrue(evaluate(s,"document.querySelector('.price.large strong').innerText").contains("100"));screenshot("variant");
            click(s,".pdp-add-to-cart");waitForTrue(s,"document.querySelector('.pdp-add-to-cart')?.getAttribute('aria-pressed')==='true'","canonical cart add");
            navigate(s,"/?cal=CAL-07&tab=cart");
            waitForTrue(s,"document.querySelector('.cart-item')?.dataset.variantId==='"+data.getInt("variantM")+"'","canonical cart identity");
            clickByText(s,".order-summary button","Sunucuda Doğrula");
            waitForTrue(s,"document.querySelector('.summary-product')?.dataset.variantId==='"+data.getInt("variantM")+"'","real R27 checkout variant quote");
            assertTrue(evaluate(s,"document.querySelector('.summary-product').innerText").contains("100"));screenshot("checkout");
            evaluate(s,"localStorage.removeItem('novastore.customer.variant-selection.v1');localStorage.removeItem('novastore.customer.cart.v1');true");
        }
    }
    private static void fill(ActivityScenario<MainActivity> s,String selector,String value) throws Exception {
        waitForTrue(s,"Boolean(document.querySelector("+JSONObject.quote(selector)+"))","input ready");
        evaluate(s,"(() => {const n=document.querySelector("+JSONObject.quote(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+JSONObject.quote(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
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
