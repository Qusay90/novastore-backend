package com.novastore.app;

import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NovaShare")
public final class NovaSharePlugin extends Plugin {
    @PluginMethod
    public void shareProduct(PluginCall call) {
        String rawTitle = call.getString("title");
        if (rawTitle == null) {
            call.reject("Product title is required.");
            return;
        }
        String title = rawTitle.trim();
        if (title.isEmpty() || title.length() > 120 || title.chars().anyMatch(Character::isISOControl)) {
            call.reject("Product title is invalid.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType("text/plain");
            share.putExtra(Intent.EXTRA_TEXT, title);
            getActivity().startActivity(Intent.createChooser(share, "Ürünü paylaş"));
            call.resolve();
        });
    }
}
