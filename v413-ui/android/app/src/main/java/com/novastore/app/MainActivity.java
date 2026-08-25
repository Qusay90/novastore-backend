package com.novastore.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int NOVASTORE_SYSTEM_BAR_SURFACE = Color.rgb(248, 248, 249);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(NovaInsetsPlugin.class);
        registerPlugin(NovaPrintPlugin.class);
        registerPlugin(NovaPublicStorePlugin.class);
        registerPlugin(NovaSharePlugin.class);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(NOVASTORE_SYSTEM_BAR_SURFACE);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);

        hardenLocalWebView();
    }

    private void hardenLocalWebView() {
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(BuildConfig.DEBUG
            ? WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            : WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        CookieManager.getInstance().setAcceptCookie(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
    }
}
