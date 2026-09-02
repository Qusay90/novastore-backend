package com.novastore.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "NovaPublicStore")
public final class NovaPublicStorePlugin extends Plugin {
    private static final Pattern STORE_SLUG =
        Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*$");
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

    @PluginMethod
    public void getPublicStore(PluginCall call) {
        String slug = canonicalSlug(call.getString("storeSlug"));
        if (slug == null) {
            call.reject("INVALID_PUBLIC_STORE_SLUG");
            return;
        }
        getBridge().execute(() -> loadPublicStore(call, slug));
    }

    private void loadPublicStore(PluginCall call, String slug) {
        HttpURLConnection connection = null;
        try {
            URI base = validatedApiBase();
            URL endpoint = base.resolve("api/public/stores/" + slug).toURL();
            connection = (HttpURLConnection) endpoint.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(8_000);
            connection.setReadTimeout(8_000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setDoInput(true);
            connection.setRequestProperty("Accept", "application/json");

            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                call.reject("PUBLIC_STORE_HTTP_" + status);
                return;
            }
            String contentType = connection.getContentType();
            if (contentType == null || !contentType.toLowerCase(Locale.ROOT).startsWith("application/json")) {
                call.reject("PUBLIC_STORE_CONTENT_TYPE_INVALID");
                return;
            }

            String body = readBounded(connection.getInputStream());
            JSObject result = new JSObject();
            result.put("projection", JSObject.fromJSONObject(new JSONObject(body)));
            result.put("apiOrigin", apiOrigin(base));
            result.put("allowCleartextAssets", BuildConfig.DEBUG || BuildConfig.NOVASTORE_LOCAL_UAT);
            call.resolve(result);
        } catch (IOException | JSONException | IllegalArgumentException failure) {
            call.reject("PUBLIC_STORE_REQUEST_FAILED");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private URI validatedApiBase() {
        URI base = URI.create(BuildConfig.NOVASTORE_API_BASE_URL);
        if (!isApprovedApiBase(base, BuildConfig.DEBUG, BuildConfig.NOVASTORE_LOCAL_UAT)) {
            throw new IllegalArgumentException("PUBLIC_STORE_API_ORIGIN_INVALID");
        }
        return base;
    }

    static boolean isApprovedApiBase(URI base, boolean debug, boolean localUat) {
        String scheme = base.getScheme();
        String host = base.getHost();
        boolean approvedDebug = debug
            && !localUat
            && "http".equals(scheme)
            && isIpv4Host(host, 10, 0, 2, 2)
            && base.getPort() == 5000
            && "/".equals(base.getPath())
            && base.getRawUserInfo() == null
            && base.getRawQuery() == null
            && base.getRawFragment() == null;
        boolean approvedLocalUat = localUat
            && "http".equals(scheme)
            && isIpv4Host(host, 127, 0, 0, 1)
            && base.getPort() == 5000
            && "/".equals(base.getPath())
            && base.getRawUserInfo() == null
            && base.getRawQuery() == null
            && base.getRawFragment() == null;
        boolean approvedRelease = !debug
            && !localUat
            && "https".equals(scheme)
            && "novastore.tr".equals(host)
            && base.getPort() == -1
            && "/".equals(base.getPath())
            && base.getRawUserInfo() == null
            && base.getRawQuery() == null
            && base.getRawFragment() == null;
        return approvedDebug || approvedLocalUat || approvedRelease;
    }

    private static boolean isIpv4Host(String host, int first, int second, int third, int fourth) {
        if (host == null) return false;
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return false;
        int[] expected = { first, second, third, fourth };
        for (int index = 0; index < parts.length; index++) {
            if (parts[index].isEmpty() || (parts[index].length() > 1 && parts[index].startsWith("0"))) return false;
            try {
                if (Integer.parseInt(parts[index]) != expected[index]) return false;
            } catch (NumberFormatException failure) {
                return false;
            }
        }
        return true;
    }

    static String canonicalSlug(String value) {
        if (value == null) return null;
        String slug = value.trim().toLowerCase(Locale.ROOT);
        if (slug.length() < 1 || slug.length() > 160 || !STORE_SLUG.matcher(slug).matches()) {
            return null;
        }
        return slug;
    }

    static String apiOrigin(URI base) {
        String port = base.getPort() == -1 ? "" : ":" + base.getPort();
        return base.getScheme() + "://" + base.getHost() + port;
    }

    private String readBounded(InputStream input) throws IOException {
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8_192];
            int total = 0;
            int read;
            while ((read = source.read(buffer)) != -1) {
                total += read;
                if (total > MAX_RESPONSE_BYTES) throw new IOException("PUBLIC_STORE_RESPONSE_TOO_LARGE");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
