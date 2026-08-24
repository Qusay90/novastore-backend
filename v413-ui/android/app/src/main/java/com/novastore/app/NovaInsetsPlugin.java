package com.novastore.app;

import android.net.Uri;
import android.view.View;
import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NovaInsets")
public final class NovaInsetsPlugin extends Plugin {

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> {
            View webView = getBridge().getWebView();
            ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
                notifyListeners("insetsChange", payload(insets), true);
                return insets;
            });
            ViewCompat.requestApplyInsets(webView);
        });
    }

    @PluginMethod
    public void getInsets(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getBridge().getWebView());
            if (insets == null) {
                call.reject("Insets are not available yet.");
                return;
            }
            call.resolve(payload(insets));
        });
    }

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        return !("https".equals(url.getScheme()) && "localhost".equals(url.getHost()));
    }

    @Override
    protected void handleOnDestroy() {
        ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), null);
        super.handleOnDestroy();
    }

    private JSObject payload(@NonNull WindowInsetsCompat windowInsets) {
        int systemTypes = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
        Insets system = windowInsets.getInsets(systemTypes);
        Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
        boolean imeVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime());
        float density = getContext().getResources().getDisplayMetrics().density;

        JSObject result = new JSObject();
        result.put("top", dp(system.top, density));
        result.put("right", dp(system.right, density));
        result.put("bottom", dp(system.bottom, density));
        result.put("left", dp(system.left, density));
        result.put("ime", imeVisible ? dp(Math.max(0, ime.bottom - system.bottom), density) : 0);
        return result;
    }

    private double dp(int pixels, float density) {
        return Math.round((pixels / density) * 100.0d) / 100.0d;
    }
}
