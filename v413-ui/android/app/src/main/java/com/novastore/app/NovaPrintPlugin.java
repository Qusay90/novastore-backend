package com.novastore.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NovaPrint")
public final class NovaPrintPlugin extends Plugin {
    @PluginMethod
    public void printCurrentDocument(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
            WebView webView = getBridge().getWebView();
            if (printManager == null || webView == null) {
                call.reject("Print service is unavailable.");
                return;
            }
            printManager.print(
                "NovaStore E-Arşiv Fatura",
                webView.createPrintDocumentAdapter("NovaStore E-Arşiv Fatura"),
                new PrintAttributes.Builder().build()
            );
            call.resolve();
        });
    }
}
