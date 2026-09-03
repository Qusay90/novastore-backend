package com.novastore.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.Espresso.pressBack;
import static androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom;

import android.app.Instrumentation;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.test.espresso.ViewAction;
import androidx.test.espresso.action.GeneralSwipeAction;
import androidx.test.espresso.action.Press;
import androidx.test.espresso.action.Swipe;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeShellInstrumentedTest {
    private static final long WEB_TIMEOUT_SECONDS = 30;

    @Test
    public void localBundleUsesAuthoritativeUiWithoutFakeDeviceChrome() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<Boolean> darkStatusIconsRef = new AtomicReference<>(false);
            scenario.onActivity(activity -> {
                boolean darkStatusIcons;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    darkStatusIcons = (activity.getWindow().getInsetsController().getSystemBarsAppearance()
                        & WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS) != 0;
                } else {
                    darkStatusIcons = (activity.getWindow().getDecorView().getSystemUiVisibility()
                        & View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) != 0;
                }
                darkStatusIconsRef.set(darkStatusIcons);
            });

            JSONObject state = evaluateJson(scenario,
                "(() => {" +
                    "const root=document.querySelector('.native-mobile-runtime');" +
                    "const screen=document.querySelector('[data-testid=native-mobile-screen]');" +
                    "const topbar=document.querySelector('.fixed-app-header,.pdp-topbar');" +
                    "const safeTop=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--novastore-safe-top'))||0;" +
                    "const screenRect=screen.getBoundingClientRect();" +
                    "const topHit=document.elementFromPoint(innerWidth/2,Math.max(1,safeTop/2));" +
                    "return {" +
                    "ready: document.readyState," +
                    "href: location.href," +
                    "runtime: document.documentElement.dataset.novastoreRuntime," +
                    "calibrationApps: document.querySelectorAll('[data-testid=calibration-app]').length," +
                    "fakeChrome: document.querySelectorAll('.phone-stage,.phone-bezel,.device-screen,.status-bar,.home-indicator-svg,.android-navigation-bar,.keyboard-dock').length," +
                    "switchers: document.querySelectorAll('.cal-switcher').length," +
                    "safeTop," +
                    "screenTop:screenRect.top," +
                    "screenBottom:screenRect.bottom," +
                    "viewportBottom:innerHeight," +
                    "topHitInsideScreen:screen.contains(topHit)," +
                    "topHitIsMedia:Boolean(topHit?.closest('img,video,.product-card-media,.pdp-media'))," +
                    "rootBackground:getComputedStyle(root).backgroundColor," +
                    "physicalContentTop:topbar.getBoundingClientRect().top," +
                    "expectedContentTop:Math.max(34,safeTop+8)" +
                    "};" +
                "})()"
            );

            assertEquals("complete", state.getString("ready"));
            assertTrue(state.getString("href").startsWith("https://localhost"));
            assertEquals("native", state.getString("runtime"));
            assertEquals(1, state.getInt("calibrationApps"));
            assertEquals(0, state.getInt("fakeChrome"));
            assertEquals(0, state.getInt("switchers"));
            assertTrue(state.getDouble("safeTop") > 0);
            assertEquals(state.getDouble("safeTop"), state.getDouble("screenTop"), 1.0);
            assertEquals(state.getDouble("viewportBottom"), state.getDouble("screenBottom"), 1.0);
            assertFalse(state.getBoolean("topHitInsideScreen"));
            assertFalse(state.getBoolean("topHitIsMedia"));
            assertEquals("rgb(248, 248, 249)", state.getString("rootBackground"));
            assertEquals(state.getDouble("expectedContentTop"), state.getDouble("physicalContentTop"), 1.0);
            assertTrue(darkStatusIconsRef.get());
        }
    }

    @Test
    public void webViewAndBridgeStayLeastPrivilege() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<WebSettings> settingsRef = new AtomicReference<>();
            AtomicReference<Boolean> cookieRef = new AtomicReference<>();
            scenario.onActivity(activity -> {
                WebView webView = activity.getBridge().getWebView();
                settingsRef.set(webView.getSettings());
                cookieRef.set(CookieManager.getInstance().acceptCookie());
            });

            WebSettings settings = settingsRef.get();
            assertFalse(settings.getAllowFileAccess());
            assertFalse(settings.getAllowContentAccess());
            assertFalse(settings.getAllowFileAccessFromFileURLs());
            assertFalse(settings.getAllowUniversalAccessFromFileURLs());
            assertEquals(
                BuildConfig.DEBUG ? WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE : WebSettings.MIXED_CONTENT_NEVER_ALLOW,
                settings.getMixedContentMode()
            );
            assertFalse(settings.getJavaScriptCanOpenWindowsAutomatically());
            assertFalse(settings.supportMultipleWindows());
            assertTrue(settings.getMediaPlaybackRequiresUserGesture());
            assertFalse(cookieRef.get());

            JSONObject bridge = evaluateJson(scenario,
                "(() => ({" +
                    "app: Capacitor.isPluginAvailable('App')," +
                    "insets: Capacitor.isPluginAvailable('NovaInsets')," +
                    "print: Capacitor.isPluginAvailable('NovaPrint')," +
                    "share: Capacitor.isPluginAvailable('NovaShare')," +
                    "publicStore: Capacitor.isPluginAvailable('NovaPublicStore')," +
                    "customerSession: Capacitor.isPluginAvailable('NovaCustomerSession')," +
                    "notificationApi: Capacitor.isPluginAvailable('NovaNotificationApi')," +
                    "pushNotifications: Capacitor.isPluginAvailable('PushNotifications')," +
                    "http: Capacitor.isPluginAvailable('CapacitorHttp')," +
                    "cookies: Capacitor.isPluginAvailable('CapacitorCookies')," +
                    "webview: Capacitor.isPluginAvailable('WebView')," +
                    "systemBars: Capacitor.isPluginAvailable('SystemBars')," +
                    "csp: document.querySelector('meta[http-equiv=Content-Security-Policy]')?.content || ''" +
                "}))()"
            );
            assertTrue(bridge.getBoolean("app"));
            assertTrue(bridge.getBoolean("insets"));
            assertTrue(bridge.getBoolean("print"));
            assertTrue(bridge.getBoolean("share"));
            assertTrue(bridge.getBoolean("publicStore"));
            assertTrue(bridge.getBoolean("customerSession"));
            assertTrue(bridge.getBoolean("notificationApi"));
            assertTrue(bridge.getBoolean("pushNotifications"));
            assertFalse(bridge.getBoolean("http"));
            assertFalse(bridge.getBoolean("cookies"));
            assertFalse(bridge.getBoolean("webview"));
            assertFalse(bridge.getBoolean("systemBars"));
            assertTrue(bridge.getString("csp").contains("connect-src 'none'"));
            assertTrue(bridge.getString("csp").contains("frame-src 'none'"));
        }
    }

    @Test
    public void browserStoresContainNoSessionOrPaymentSecrets() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            JSONObject stores = evaluateJson(scenario,
                "(() => {" +
                    "const allowedLocal=new Set(['novastore.android.installationId','novastore.novabot.presentation.v1']);" +
                    "const localKeys=Object.keys(localStorage);" +
                    "const values=[...Object.entries(localStorage),...Object.entries(sessionStorage)].flat().join(' ');" +
                    "return {localUnexpected:localKeys.filter(key=>!allowedLocal.has(key)).length," +
                    "local:localStorage.length,session:sessionStorage.length,cookie:document.cookie," +
                    "secret:/bearer|refresh[_-]?token|access[_-]?token|authorization/i.test(values)};" +
                "})()"
            );
            assertTrue(stores.getInt("local") <= 2);
            assertEquals(0, stores.getInt("localUnexpected"));
            assertEquals(0, stores.getInt("session"));
            assertEquals("", stores.getString("cookie"));
            assertFalse(stores.getBoolean("secret"));
        }
    }

    @Test
    public void allThirtySevenCanonicalStatesRenderFromEmbeddedAssets() throws Exception {
        String[][] routes = new String[][] {
            {"CAL-01", "account", "login"}, {"CAL-01", "account", "forgot"},
            {"CAL-01", "account", "register"}, {"CAL-02", "home", ""},
            {"CAL-02", "home", "search"}, {"CAL-03", "categories", ""},
            {"CAL-04", "home", ""}, {"CAL-04", "favorites", ""},
            {"CAL-04", "home", "store"}, {"CAL-05", "home", ""},
            {"CAL-06", "home", ""}, {"CAL-07", "cart", ""},
            {"CAL-08", "cart", ""}, {"CAL-08", "cart", "address"},
            {"CAL-08", "cart", "success"}, {"CAL-09", "account", ""},
            {"CAL-09", "account", "invoice"}, {"CAL-09", "account", "tracking"},
            {"CAL-10", "account", ""}, {"CAL-10", "account", "returns"},
            {"CAL-10", "account", "faq"}, {"CAL-10", "account", "history"},
            {"CAL-10", "account", "addresses"}, {"CAL-10", "account", "notifications"},
            {"CAL-10", "account", "profile"}, {"CAL-10", "account", "payments"},
            {"CAL-10", "account", "coupons"}, {"CAL-10", "account", "reviews"},
            {"CAL-10", "account", "questions"}, {"CAL-10", "account", "security"},
            {"CAL-10", "account", "followed-stores"}, {"CAL-10", "account", "settings"},
            {"CAL-11", "support", ""},
            {"CAL-11", "support", "faq"}, {"CAL-11", "support", "history"},
            {"CAL-11", "support", "live"}, {"CAL-12", "support", ""}
        };

        assertEquals(37, routes.length);

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            for (String[] route : routes) {
                String view = route[2];
                String query = "?cal=" + route[0] + "&tab=" + route[1]
                    + (view.isEmpty() ? "" : "&view=" + view) + "&shell=native";
                String script = "(() => {history.replaceState(null,'','/" + query
                    + "');dispatchEvent(new PopStateEvent('popstate'));return true})()";
                evaluate(scenario, script);
                Thread.sleep(120);
                JSONObject state = evaluateJson(scenario,
                    "(() => {const app=document.querySelector('[data-testid=calibration-app]');return {" +
                    "cal:app?.dataset.calId||'',view:app?.dataset.view||'',text:(app?.innerText||'').trim().length," +
                    "fake:document.querySelectorAll('.phone-stage,.phone-bezel,.device-screen,.cal-switcher').length};})()"
                );
                assertEquals(route[0], state.getString("cal"));
                assertEquals(view.isEmpty() ? "root" : view, state.getString("view"));
                assertTrue(route[0] + "/" + route[1] + "/" + view, state.getInt("text") > 20);
                assertEquals(0, state.getInt("fake"));
            }
        }
    }

    @Test
    public void coldAndWarmDeepLinksOwnOnlyTheirTypedRouteHistory() throws Exception {
        Intent cold = new Intent(Intent.ACTION_VIEW, Uri.parse(
            "novastore://customer?cal=CAL-01&tab=account&view=login"
        ));
        cold.setClassName(
            InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName(),
            MainActivity.class.getName()
        );
        cold.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(cold)) {
            JSONObject coldState = waitForRoute(scenario, "CAL-01", "login", 0);
            assertEquals("CAL-01", coldState.getString("cal"));
            assertEquals("login", coldState.getString("view"));
            assertEquals(0, coldState.getInt("depth"));

            scenario.onActivity(activity -> {
                Intent warm = new Intent(Intent.ACTION_VIEW, Uri.parse(
                    "novastore://customer?cal=CAL-04&tab=home&view=store"
                ));
                warm.setClass(activity, MainActivity.class);
                activity.startActivity(warm);
            });
            JSONObject warmState = waitForRoute(scenario, "CAL-04", "store", 1);
            assertEquals("CAL-04", warmState.getString("cal"));
            assertEquals("store", warmState.getString("view"));
            assertEquals(1, warmState.getInt("depth"));

            scenario.onActivity(activity -> {
                Intent illegal = new Intent(Intent.ACTION_VIEW, Uri.parse(
                    "novastore://customer?cal=CAL-10&tab=support&view=faq"
                ));
                illegal.setClass(activity, MainActivity.class);
                activity.startActivity(illegal);
            });
            Thread.sleep(500);
            JSONObject rejectedState = routeAndDepth(scenario);
            assertEquals("CAL-04", rejectedState.getString("cal"));
            assertEquals("store", rejectedState.getString("view"));
            assertEquals(1, rejectedState.getInt("depth"));

            pressBack();
            JSONObject backState = waitForRoute(scenario, "CAL-01", "login", 0);
            assertEquals("CAL-01", backState.getString("cal"));
            assertEquals("login", backState.getString("view"));
            assertEquals(0, backState.getInt("depth"));
            assertEquals("history", backState.getString("backAction"));
        }
    }

    @Test
    public void historyInjectedIllegalRoutesCanonicalizeWithoutCreatingAThirtySeventhState() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            evaluate(scenario,
                "history.replaceState({novastoreDepth:0},'','/?cal=CAL-01&tab=account&shell=native');" +
                    "dispatchEvent(new PopStateEvent('popstate'));true"
            );
            Thread.sleep(300);
            JSONObject loginAlias = routeAndDepth(scenario);
            assertEquals("CAL-01", loginAlias.getString("cal"));
            assertEquals("login", loginAlias.getString("view"));
            assertEquals("?cal=CAL-01&tab=account&view=login&shell=native", loginAlias.getString("search"));

            evaluate(scenario,
                "history.replaceState({novastoreDepth:0},'','/?cal=CAL-10&tab=support&view=faq&token=secret');" +
                    "dispatchEvent(new PopStateEvent('popstate'));true"
            );
            Thread.sleep(300);
            JSONObject safe = routeAndDepth(scenario);
            assertEquals("CAL-02", safe.getString("cal"));
            assertEquals("root", safe.getString("view"));
            assertEquals(0, safe.getInt("depth"));
            assertEquals("?cal=CAL-02&tab=home&shell=native", safe.getString("search"));
        }
    }

    @Test
    public void armedNativePullRefreshSurvivesWebViewTouchCancellation() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            evaluate(scenario,
                "history.replaceState({novastoreDepth:0},'','/?cal=CAL-02&tab=home&shell=native');" +
                    "dispatchEvent(new PopStateEvent('popstate'));true"
            );
            Thread.sleep(300);

            onView(isAssignableFrom(WebView.class)).perform(nativePullGesture());
            Thread.sleep(1400);

            JSONObject refresh = evaluateJson(scenario,
                "(() => {const app=document.querySelector('[data-testid=calibration-app]');return {" +
                    "id:Number(app?.dataset.refreshId||0),source:app?.dataset.refreshSource||''};})()"
            );
            assertTrue(refresh.getInt("id") > 0);
            assertEquals("pull", refresh.getString("source"));
        }
    }

    @Test
    public void notificationRouteRequiresGuestLoginWithoutRequestingPermission() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            evaluate(scenario,
                "history.replaceState({novastoreDepth:0},'','/?cal=CAL-10&tab=account&view=notifications&shell=native');" +
                    "dispatchEvent(new PopStateEvent('popstate'));true"
            );
            waitForTrue(scenario,
                "Boolean(document.querySelector('[data-testid=account-guest]'))",
                "private notification route did not stop at the guest account gate"
            );
            JSONObject state = evaluateJson(scenario,
                "(() => ({" +
                    "guestGate:Boolean(document.querySelector('[data-testid=account-guest]'))," +
                    "notificationScreen:Boolean(document.querySelector('[data-testid=notification-center-screen]'))," +
                    "permissionRequested:localStorage.getItem('novastore.android.notificationPermissionRequested')," +
                    "token:localStorage.getItem('novastore.android.fcmToken')," +
                    "inApp:document.querySelectorAll('.notification-in-app').length" +
                "}))()"
            );
            assertTrue(state.getBoolean("guestGate"));
            assertFalse(state.getBoolean("notificationScreen"));
            assertTrue(state.isNull("permissionRequested"));
            assertTrue(state.isNull("token"));
            assertEquals(0, state.getInt("inApp"));
        }
    }

    @Test
    public void productCardImageYieldsHumanWobbleVerticalSwipeToPageScroll() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            evaluate(scenario,
                "history.replaceState({novastoreDepth:0},'','/?cal=CAL-02&tab=home&shell=native');" +
                    "dispatchEvent(new PopStateEvent('popstate'));" +
                    "document.querySelector('.mobile-scroll')?.scrollTo(0,0);true"
            );
            Thread.sleep(500);

            JSONObject before = productCardGestureState(scenario);
            assertEquals(0, before.getInt("scrollTop"));
            assertEquals(0, before.getInt("page"));

            sendProductCardHumanWobbleVerticalGesture(
                scenario,
                (float) before.getDouble("gestureXRatio"),
                (float) before.getDouble("gestureYRatio")
            );
            Thread.sleep(700);

            JSONObject after = productCardGestureState(scenario);
            assertTrue("vertical swipe beginning on product media did not scroll the page: " + after,
                after.getInt("scrollTop") > 48);
            assertEquals("vertical swipe changed the product image", 0, after.getInt("page"));
        }
    }

    @Test
    public void pdpMediaStateMatchesAuthoritativeNativeProjectionAndWrapsWhenMultiple() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            evaluate(scenario,
                "history.replaceState({novastoreDepth:0},'','/?cal=CAL-02&tab=home&shell=native');" +
                    "dispatchEvent(new PopStateEvent('popstate'));true"
            );
            waitForTrue(scenario,
                "Boolean(document.querySelector('[data-testid=home-product-card-0] .product-open-media'))",
                "authoritative public product card did not render"
            );
            evaluate(scenario,
                "document.querySelector('[data-testid=home-product-card-0] .product-open-media')?.click();true"
            );
            waitForTrue(scenario,
                "Boolean(document.querySelector('[data-testid=product-detail-screen] .pdp-media-carousel'))",
                "authoritative public product detail did not render"
            );

            JSONObject media = evaluateJson(scenario,
                "(() => {const carousel=document.querySelector('.pdp-media-carousel');return {" +
                    "logical:Number(carousel?.dataset.page),physical:Number(carousel?.dataset.physicalPage)," +
                    "counter:document.querySelector('.pdp-gallery-meta>b')?.textContent?.trim()||''," +
                    "originals:carousel?.querySelectorAll('.pdp-main-media:not([data-carousel-clone])').length||0," +
                    "clones:carousel?.querySelectorAll('[data-carousel-clone]').length||0," +
                    "arrows:document.querySelectorAll('.pdp-gallery-arrows button').length};})()"
            );
            int mediaCount = media.getInt("originals");
            assertTrue("authoritative product must expose at least one image", mediaCount >= 1);
            if (mediaCount == 1) {
                assertEquals(0, media.getInt("logical"));
                assertEquals(0, media.getInt("physical"));
                assertEquals("1 / 1", media.getString("counter"));
                assertEquals(0, media.getInt("clones"));
                assertEquals(0, media.getInt("arrows"));
                return;
            }

            evaluate(scenario,
                "(() => {const dots=document.querySelectorAll('.gallery-dots button');dots[dots.length-1]?.click();return true})()"
            );
            Thread.sleep(400);
            JSONObject pdpLast = evaluateJson(scenario,
                "(() => {const carousel=document.querySelector('.pdp-media-carousel');return {" +
                    "logical:Number(carousel?.dataset.page),physical:Number(carousel?.dataset.physicalPage)," +
                    "counter:document.querySelector('.pdp-gallery-meta>b')?.textContent?.trim()||''," +
                    "originals:carousel?.querySelectorAll('.pdp-main-media:not([data-carousel-clone])').length||0," +
                    "clones:carousel?.querySelectorAll('[data-carousel-clone]').length||0," +
                    "inert:[...(carousel?.querySelectorAll('[data-carousel-clone]')||[])].every(node=>node.inert&&node.getAttribute('aria-hidden')==='true')," +
                    "arrows:[...document.querySelectorAll('.pdp-gallery-arrows button')].every(button=>!button.disabled)};})()"
            );
            assertEquals(mediaCount - 1, pdpLast.getInt("logical"));
            assertEquals(mediaCount, pdpLast.getInt("physical"));
            assertEquals(mediaCount + " / " + mediaCount, pdpLast.getString("counter"));
            assertEquals(mediaCount, pdpLast.getInt("originals"));
            assertEquals(2, pdpLast.getInt("clones"));
            assertTrue(pdpLast.getBoolean("inert"));
            assertTrue(pdpLast.getBoolean("arrows"));

            evaluate(scenario, "document.querySelector('.pdp-gallery-arrows button:last-child')?.click();true");
            Thread.sleep(450);
            JSONObject pdpFirst = evaluateJson(scenario,
                "(() => {const carousel=document.querySelector('.pdp-media-carousel');return {" +
                    "logical:Number(carousel?.dataset.page),physical:Number(carousel?.dataset.physicalPage)," +
                    "target:Number(carousel?.dataset.targetPage),settling:carousel?.dataset.settling," +
                    "overscroll:carousel?.dataset.overscroll,counter:document.querySelector('.pdp-gallery-meta>b')?.textContent?.trim()||''};})()"
            );
            assertEquals(0, pdpFirst.getInt("logical"));
            assertEquals(1, pdpFirst.getInt("physical"));
            assertEquals(0, pdpFirst.getInt("target"));
            assertEquals("false", pdpFirst.getString("settling"));
            assertEquals("0.00", pdpFirst.getString("overscroll"));
            assertEquals("1 / 3", pdpFirst.getString("counter"));

            evaluate(scenario, "document.querySelector('.pdp-gallery-arrows button:first-child')?.click();true");
            Thread.sleep(450);
            JSONObject pdpReverse = evaluateJson(scenario,
                "(() => {const carousel=document.querySelector('.pdp-media-carousel');return {" +
                    "logical:Number(carousel?.dataset.page),physical:Number(carousel?.dataset.physicalPage)," +
                    "counter:document.querySelector('.pdp-gallery-meta>b')?.textContent?.trim()||''};})()"
            );
            assertEquals(mediaCount - 1, pdpReverse.getInt("logical"));
            assertEquals(mediaCount, pdpReverse.getInt("physical"));
            assertEquals(mediaCount + " / " + mediaCount, pdpReverse.getString("counter"));

            evaluate(scenario,
                "(() => {const slides=document.querySelectorAll('.pdp-main-media:not([data-carousel-clone])');slides[slides.length-1]?.click();return true})()"
            );
            Thread.sleep(300);
            evaluate(scenario, "document.querySelector('.viewer-arrows button:last-child')?.click();true");
            Thread.sleep(450);
            JSONObject viewerFirst = evaluateJson(scenario,
                "(() => {const viewer=document.querySelector('.pdp-image-viewer');const carousel=viewer?.querySelector('.viewer-carousel');return {" +
                    "open:!!viewer,logical:Number(carousel?.dataset.page),physical:Number(carousel?.dataset.physicalPage)," +
                    "counter:viewer?.querySelector('header b')?.textContent?.trim()||'',zoomed:viewer?.dataset.viewerZoomed," +
                    "arrows:[...(viewer?.querySelectorAll('.viewer-arrows button')||[])].every(button=>!button.disabled)};})()"
            );
            assertTrue(viewerFirst.getBoolean("open"));
            assertEquals(0, viewerFirst.getInt("logical"));
            assertEquals(1, viewerFirst.getInt("physical"));
            assertEquals("1 / 3", viewerFirst.getString("counter"));
            assertEquals("false", viewerFirst.getString("zoomed"));
            assertTrue(viewerFirst.getBoolean("arrows"));

            evaluate(scenario,
                "window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));true"
            );
            Thread.sleep(450);
            JSONObject viewerLast = evaluateJson(scenario,
                "(() => {const viewer=document.querySelector('.pdp-image-viewer');const carousel=viewer?.querySelector('.viewer-carousel');return {" +
                    "logical:Number(carousel?.dataset.page),physical:Number(carousel?.dataset.physicalPage)," +
                    "counter:viewer?.querySelector('header b')?.textContent?.trim()||''};})()"
            );
            assertEquals(mediaCount - 1, viewerLast.getInt("logical"));
            assertEquals(mediaCount, viewerLast.getInt("physical"));
            assertEquals(mediaCount + " / " + mediaCount, viewerLast.getString("counter"));

            evaluate(scenario,
                "window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));true"
            );
            Thread.sleep(450);
            JSONObject viewerWrapped = evaluateJson(scenario,
                "(() => {const viewer=document.querySelector('.pdp-image-viewer');const carousel=viewer?.querySelector('.viewer-carousel');return {" +
                    "logical:Number(carousel?.dataset.page),physical:Number(carousel?.dataset.physicalPage)," +
                    "counter:viewer?.querySelector('header b')?.textContent?.trim()||''};})()"
            );
            assertEquals(0, viewerWrapped.getInt("logical"));
            assertEquals(1, viewerWrapped.getInt("physical"));
            assertEquals("1 / 3", viewerWrapped.getString("counter"));
        }
    }

    @Test
    public void globalNovaBotIsSingletonAndClearsNativeNavigationAndPdpControls() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            evaluate(scenario,
                "history.replaceState({novastoreDepth:0},'','/?cal=CAL-02&tab=home&shell=native');" +
                    "dispatchEvent(new PopStateEvent('popstate'));true"
            );
            Thread.sleep(300);
            JSONObject home = evaluateJson(scenario,
                "(() => {const launchers=[...document.querySelectorAll('[data-testid=global-novabot-trigger]')];" +
                    "const launcher=launchers[0]?.getBoundingClientRect();const nav=document.querySelector('.bottom-nav')?.getBoundingClientRect();" +
                    "return {count:launchers.length,width:launcher?.width||0,height:launcher?.height||0," +
                    "navGap:launcher&&nav?nav.top-launcher.bottom:-999,asset:launchers[0]?.querySelector('img')?.getAttribute('src')||''};})()"
            );
            assertEquals(1, home.getInt("count"));
            assertTrue(home.getDouble("width") >= 44);
            assertTrue(home.getDouble("height") >= 44);
            assertTrue(home.getDouble("navGap") >= 0);
            assertTrue(home.getString("asset").endsWith("/calibration-assets/official/support_novastore.png"));

            waitForTrue(scenario,
                "Boolean(document.querySelector('[data-testid=home-product-card-0] .product-open-media'))",
                "authoritative public product card did not render before the product launcher check"
            );
            evaluate(scenario,
                "document.querySelector('[data-testid=home-product-card-0] .product-open-media')?.click();true"
            );
            waitForTrue(scenario,
                "Boolean(document.querySelector('[data-testid=product-detail-screen]') && document.querySelector('[data-testid=global-novabot-trigger]'))",
                "product NovaBot launcher did not render"
            );
            JSONObject product = evaluateJson(scenario,
                "(() => {const launchers=[...document.querySelectorAll('[data-testid=global-novabot-trigger]')];" +
                    "const launcher=launchers[0]?.getBoundingClientRect();const footer=document.querySelector('.pdp-footer')?.getBoundingClientRect();" +
                    "return {count:launchers.length,footerGap:launcher&&footer?footer.top-launcher.bottom:-999," +
                    "inTopbar:Boolean(launchers[0]?.closest('.pdp-topbar'))," +
                    "inAppRoot:Boolean(launchers[0]?.closest('.cal-app'))};})()"
            );
            assertEquals(1, product.getInt("count"));
            assertTrue(product.getDouble("footerGap") >= 0);
            assertFalse(product.getBoolean("inTopbar"));
            assertTrue(product.getBoolean("inAppRoot"));

            evaluate(scenario,
                "history.replaceState({novastoreDepth:0},'','/?cal=CAL-08&tab=cart&shell=native');" +
                    "dispatchEvent(new PopStateEvent('popstate'));true"
            );
            Thread.sleep(300);
            assertEquals("0", evaluate(scenario,
                "document.querySelectorAll('[data-testid=global-novabot-trigger]').length"
            ));

            evaluate(scenario,
                "history.replaceState({novastoreDepth:0},'','/?cal=CAL-12&tab=support&shell=native');" +
                    "dispatchEvent(new PopStateEvent('popstate'));true"
            );
            Thread.sleep(300);
            assertEquals("0", evaluate(scenario,
                "document.querySelectorAll('[data-testid=global-novabot-trigger]').length"
            ));
        }
    }

    @Test
    public void nativeNovaBotUsesExistingSupportChannelWithoutFakeEscalation() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            evaluate(scenario,
                "history.replaceState({novastoreDepth:0},'','/?cal=CAL-12&tab=support&shell=native');" +
                    "dispatchEvent(new PopStateEvent('popstate'));true"
            );
            Thread.sleep(300);
            JSONObject before = evaluateJson(scenario,
                "(() => {const app=document.querySelector('[data-testid=calibration-app]');const mode=app?.querySelector('[data-testid=novabot-mode-control]')?.getBoundingClientRect();" +
                    "const reset=app?.querySelector('[data-testid=novabot-conversation-reset]')?.getBoundingClientRect();" +
                    "const header=app?.querySelector('.native-chat-card>header')?.getBoundingClientRect();const messages=app?.querySelector('.native-chat-card>.messages')?.getBoundingClientRect();const text=app?.innerText||'';return {" +
                    "cal:app?.dataset.calId||'',legacy:(app?.innerText||'').includes('Seni canlı destek sırasına aldım.')," +
                    "button:!!app?.querySelector('.escalate'),mode:!!mode,modeInHeader:!!mode&&!!header&&mode.right<=header.right+1&&mode.bottom<=header.bottom+1," +
                    "reset:!!reset,resetTarget:!!reset&&reset.width>=44&&reset.height>=44,resetInHeader:!!reset&&!!header&&reset.right<=header.right+1&&reset.bottom<=header.bottom+1," +
                    "headerClear:!!header&&!!messages&&messages.top>=header.bottom-1,rawProvider:/ADVANCED_PROVIDER|GEMINI|API_KEY|billing/i.test(text)};})()"
            );
            assertEquals("CAL-12", before.getString("cal"));
            assertFalse(before.getBoolean("legacy"));
            assertTrue(before.getBoolean("button"));
            assertTrue(before.getBoolean("mode"));
            assertTrue(before.getBoolean("modeInHeader"));
            assertTrue(before.getBoolean("reset"));
            assertTrue(before.getBoolean("resetTarget"));
            assertTrue(before.getBoolean("resetInHeader"));
            assertTrue(before.getBoolean("headerClear"));
            assertFalse(before.getBoolean("rawProvider"));

            evaluate(scenario, "document.querySelector('.escalate')?.click();true");
            Thread.sleep(200);
            JSONObject after = evaluateJson(scenario,
                "(() => {const app=document.querySelector('[data-testid=calibration-app]');const text=app?.innerText||'';return {" +
                    "cal:app?.dataset.calId||'',view:app?.dataset.view||'',authoritative:text.includes('Destek hesabına giriş yap')," +
                    "legacy:text.includes('Seni canlı destek sırasına aldım.')};})()"
            );
            assertEquals("CAL-11", after.getString("cal"));
            assertEquals("live", after.getString("view"));
            assertTrue(after.getBoolean("authoritative"));
            assertFalse(after.getBoolean("legacy"));
        }
    }

    private static ViewAction nativePullGesture() {
        return new GeneralSwipeAction(
            Swipe.SLOW,
            view -> new float[] { view.getWidth() * 0.5f, view.getHeight() * 0.22f },
            view -> new float[] { view.getWidth() * 0.5f, view.getHeight() * 0.62f },
            Press.FINGER
        );
    }

    private static void sendProductCardHumanWobbleVerticalGesture(
        ActivityScenario<MainActivity> scenario,
        float xRatio,
        float yRatio
    ) throws Exception {
        AtomicReference<float[]> webViewBounds = new AtomicReference<>();
        scenario.onActivity(activity -> {
            WebView webView = activity.getBridge().getWebView();
            int[] location = new int[2];
            webView.getLocationOnScreen(location);
            webViewBounds.set(new float[] {
                location[0], location[1], webView.getWidth(), webView.getHeight()
            });
        });

        float[] bounds = webViewBounds.get();
        float left = bounds[0];
        float top = bounds[1];
        float width = bounds[2];
        float height = bounds[3];
        float startX = left + width * xRatio;
        float startY = top + height * yRatio;
        long downTime = SystemClock.uptimeMillis();
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();

        sendFinger(instrumentation, downTime, downTime, MotionEvent.ACTION_DOWN, startX, startY);
        Thread.sleep(24);
        sendFinger(instrumentation, downTime, SystemClock.uptimeMillis(), MotionEvent.ACTION_MOVE,
            startX + width * 0.02f, startY - height * 0.004f);
        float wobbleX = startX + width * 0.02f;
        float wobbleY = startY - height * 0.004f;
        float endY = Math.max(top + height * 0.12f, startY - height * 0.28f);
        for (int step = 1; step <= 24; step += 1) {
            Thread.sleep(12);
            float progress = step / 24f;
            sendFinger(instrumentation, downTime, SystemClock.uptimeMillis(), MotionEvent.ACTION_MOVE,
                wobbleX + (startX - wobbleX) * progress,
                wobbleY + (endY - wobbleY) * progress);
        }
        Thread.sleep(16);
        sendFinger(instrumentation, downTime, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP,
            startX, endY);
    }

    private static void sendFinger(
        Instrumentation instrumentation,
        long downTime,
        long eventTime,
        int action,
        float x,
        float y
    ) {
        MotionEvent event = MotionEvent.obtain(downTime, eventTime, action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        instrumentation.sendPointerSync(event);
        event.recycle();
    }

    private static JSONObject productCardGestureState(ActivityScenario<MainActivity> scenario)
        throws Exception {
        return evaluateJson(scenario,
            "(() => {const scroll=document.querySelector('.mobile-scroll');" +
                "const carousel=document.querySelector('.product-media-carousel');" +
                "const rect=carousel?.getBoundingClientRect();return {" +
                "scrollTop:Math.round(scroll?.scrollTop||0),page:Number(carousel?.dataset.page||0)," +
                "gestureXRatio:rect?(rect.left+rect.width*.5)/innerWidth:.25," +
                "gestureYRatio:rect?(rect.top+rect.height*.15)/innerHeight:.76};})()"
        );
    }

    private static JSONObject routeAndDepth(ActivityScenario<MainActivity> scenario) throws Exception {
        return evaluateJson(scenario,
            "(() => {const app=document.querySelector('[data-testid=calibration-app]');return {" +
                "cal:app?.dataset.calId||'',view:app?.dataset.view||''," +
                "search:location.search,backAction:document.documentElement.dataset.novastoreBackAction||''," +
                "depth:Number.isSafeInteger(history.state?.novastoreDepth)" +
                    "?history.state.novastoreDepth:-1};})()"
        );
    }

    private static JSONObject waitForRoute(
        ActivityScenario<MainActivity> scenario,
        String expectedCal,
        String expectedView,
        int expectedDepth
    ) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + TimeUnit.SECONDS.toMillis(WEB_TIMEOUT_SECONDS);
        JSONObject state;
        do {
            state = routeAndDepth(scenario);
            if (
                expectedCal.equals(state.getString("cal")) &&
                expectedView.equals(state.getString("view")) &&
                expectedDepth == state.getInt("depth")
            ) {
                return state;
            }
            Thread.sleep(100);
        } while (SystemClock.elapsedRealtime() < deadline);
        return state;
    }

    private static void waitForTrue(
        ActivityScenario<MainActivity> scenario,
        String script,
        String failureMessage
    ) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + TimeUnit.SECONDS.toMillis(WEB_TIMEOUT_SECONDS);
        String state;
        do {
            state = evaluate(scenario, script);
            if ("true".equals(state)) return;
            Thread.sleep(100);
        } while (SystemClock.elapsedRealtime() < deadline);
        assertEquals(failureMessage, "true", state);
    }

    private static JSONObject evaluateJson(ActivityScenario<MainActivity> scenario, String script)
        throws Exception {
        String encoded = evaluate(scenario,
            "(() => {const value=" + script + ";return JSON.stringify(value)})()"
        );
        String json = new JSONArray("[" + encoded + "]").getString(0);
        return new JSONObject(json);
    }

    private static String evaluate(ActivityScenario<MainActivity> scenario, String script)
        throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        scenario.onActivity(activity -> {
            WebView webView = activity.getBridge().getWebView();
            waitForDocument(webView, script, value, latch);
        });
        assertTrue("WebView JavaScript result timed out", latch.await(WEB_TIMEOUT_SECONDS, TimeUnit.SECONDS));
        return value.get();
    }

    private static void waitForDocument(
        WebView webView,
        String script,
        AtomicReference<String> value,
        CountDownLatch latch
    ) {
        webView.evaluateJavascript(
            "document.readyState==='complete' && !!document.querySelector('[data-testid=calibration-app]')",
            ready -> {
                if ("true".equals(ready)) {
                    webView.evaluateJavascript(script, result -> {
                        value.set(result);
                        latch.countDown();
                    });
                } else {
                    webView.postDelayed(() -> waitForDocument(webView, script, value, latch), 100);
                }
            }
        );
    }
}
